import {
  app,
  BrowserWindow,
  clipboard,
  Menu,
  WebContentsView,
  shell,
  session,
  type IpcMain,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
  type Session,
  type WebContents,
  type ContextMenuParams,
} from 'electron';
import { randomUUID } from 'crypto';
import { join } from 'path';
import type {
  BrowserModalPayload,
  BrowserNavigateOptions,
  BrowserNavigationState,
  BrowserProviderRequest,
  BrowserProviderResponseInput,
  BrowserViewBounds,
} from '@polytrader/shared';
import { GOOGLE_SEARCH_BASE_URL, POLYMARKET_WEB_URL } from '@polytrader/shared';
import { fail, ok } from '../ipc/result.js';
import {
  disconnectAllAuthorizedProviderAccounts,
  disconnectAuthorizedProviderAccountsForUrl,
  getAuthorizedProviderAccountsForUrl,
  registerBrowserProviderHandlers,
  setPreferredBrowserProviderAccount,
  type BrowserProviderPromptDelegate,
  type ProviderApproval,
} from '../browser/provider.js';
import { getWindowIcon } from './icon.js';
import { getWindowChromeOptions } from './windowChrome.js';

const DEFAULT_BROWSER_URL = POLYMARKET_WEB_URL;
const BROWSER_SESSION_PARTITION = 'persist:polytrader2-browser';
const BROWSER_USER_AGENT_PRODUCT = `Polytrader2/${app.getVersion()}`;

let browserWindow: BrowserWindow | null = null;
let browserView: WebContentsView | null = null;
let browserModalWindow: BrowserWindow | null = null;
let browserModalPayload: BrowserModalPayload | null = null;
let browserModalProviderRequestId: string | null = null;
let lastNavigationError: string | null = null;
let currentFaviconUrl: string | null = null;

const pendingProviderRequests = new Map<
  string,
  {
    resolve: (approval: ProviderApproval) => void;
  }
>();

function getSenderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

function isBrowserShellEvent(event: IpcMainInvokeEvent): boolean {
  return Boolean(browserWindow && getSenderWindow(event) === browserWindow);
}

function isBrowserModalEvent(event: IpcMainInvokeEvent): boolean {
  return Boolean(browserModalWindow && getSenderWindow(event) === browserModalWindow);
}

function wireWindowStateEvents(window: BrowserWindow): void {
  window.on('maximize', () => {
    window.webContents.send('window:maximized-changed', true);
  });
  window.on('unmaximize', () => {
    window.webContents.send('window:maximized-changed', false);
  });
}

function getViewContents() {
  if (!browserView || browserView.webContents.isDestroyed()) {
    throw new Error('Browser page is not initialized');
  }
  return browserView.webContents;
}

function isNavigationAborted(err: unknown): boolean {
  return err instanceof Error && err.message.includes('ERR_ABORTED');
}

async function buildNavigationStateFromContents(
  contents: WebContents,
  error: string | null = lastNavigationError,
): Promise<BrowserNavigationState> {
  const url = contents.getURL();
  const authorizedAccounts = await getAuthorizedProviderAccountsForUrl(url);
  return {
    url,
    title: contents.getTitle(),
    faviconUrl: currentFaviconUrl,
    walletConnection: {
      connected: authorizedAccounts.length > 0,
      accounts: authorizedAccounts,
    },
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
    isLoading: contents.isLoading(),
    error,
  };
}

function buildNavigationState(
  error: string | null = lastNavigationError,
): Promise<BrowserNavigationState> {
  return buildNavigationStateFromContents(getViewContents(), error);
}

function didBrowserCloseDuringNavigation(contents: WebContents): boolean {
  return (
    contents.isDestroyed() ||
    !browserWindow ||
    browserWindow.isDestroyed() ||
    !browserView ||
    browserView.webContents !== contents
  );
}

function sendNavigationState(error: string | null = lastNavigationError): void {
  if (
    !browserWindow ||
    browserWindow.isDestroyed() ||
    browserWindow.webContents.isDestroyed() ||
    !browserView ||
    browserView.webContents.isDestroyed()
  ) {
    return;
  }
  void buildNavigationState(error)
    .then((state) => {
      browserWindow?.webContents.send('browser-window:navigation-state', state);
    })
    .catch((err) => {
      console.warn('Failed to build browser navigation state', err);
    });
}

function getCurrentOrigin(): string {
  const url = getViewContents().getURL();
  try {
    return new URL(url).origin;
  } catch {
    return url || DEFAULT_BROWSER_URL;
  }
}

function notifyRemoteProviderAccountsChanged(accounts: string[]): void {
  if (!browserView || browserView.webContents.isDestroyed()) return;
  const serializedAccounts = JSON.stringify(accounts);
  void browserView.webContents
    .executeJavaScript(`window.__fbPolymarketDesktopSetAccounts?.(${serializedAccounts});`)
    .catch(() => undefined);
}

function normalizeBrowserUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_BROWSER_URL;

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (hasScheme) {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Only http or https pages are supported');
    }
    return url.toString();
  }

  const looksLikeHost =
    trimmed === 'localhost' ||
    trimmed.startsWith('localhost:') ||
    trimmed.includes('.') ||
    /^(\d{1,3}\.){3}\d{1,3}/.test(trimmed);
  return looksLikeHost
    ? `https://${trimmed}`
    : `${GOOGLE_SEARCH_BASE_URL}?q=${encodeURIComponent(trimmed)}`;
}

function ensureBrowserSession(): Session {
  const browserSession = session.fromPartition(BROWSER_SESSION_PARTITION);
  browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  return browserSession;
}

function appendBrowserUserAgentProduct(contents: WebContents): void {
  const defaultUserAgent = contents.getUserAgent();
  if (defaultUserAgent.includes(BROWSER_USER_AGENT_PRODUCT)) return;
  contents.setUserAgent(`${defaultUserAgent} ${BROWSER_USER_AGENT_PRODUCT}`);
}

function appendSeparator(template: MenuItemConstructorOptions[]): void {
  const lastItem = template.at(-1);
  if (lastItem && lastItem.type !== 'separator') {
    template.push({ type: 'separator' });
  }
}

function buildBrowserContextMenu(
  contents: WebContents,
  params: ContextMenuParams,
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [];
  const hasSelection = params.selectionText.trim().length > 0;
  const hasLink = params.linkURL.trim().length > 0;
  const hasImage = params.mediaType === 'image' && params.srcURL.trim().length > 0;

  if (hasLink) {
    template.push(
      {
        label: 'Open Link',
        click: () => {
          void navigateBrowser(params.linkURL);
        },
      },
      {
        label: 'Open Link in System Browser',
        click: () => {
          void shell.openExternal(params.linkURL);
        },
      },
      { label: 'Copy Link Address', click: () => clipboard.writeText(params.linkURL) },
    );
  }

  if (hasImage) {
    appendSeparator(template);
    template.push(
      {
        label: 'Open Image in System Browser',
        click: () => {
          void shell.openExternal(params.srcURL);
        },
      },
      { label: 'Copy Image', click: () => contents.copyImageAt(params.x, params.y) },
      { label: 'Copy Image Address', click: () => clipboard.writeText(params.srcURL) },
      { label: 'Save Image', click: () => contents.downloadURL(params.srcURL) },
    );
  }

  if (params.isEditable) {
    appendSeparator(template);
    template.push(
      { label: 'Undo', role: 'undo', enabled: params.editFlags.canUndo },
      { label: 'Redo', role: 'redo', enabled: params.editFlags.canRedo },
      { type: 'separator' },
      { label: 'Cut', role: 'cut', enabled: params.editFlags.canCut },
      { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
      { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste },
      { label: 'Select All', role: 'selectAll', enabled: params.editFlags.canSelectAll },
    );
  } else if (hasSelection) {
    appendSeparator(template);
    template.push({ label: 'Copy', role: 'copy' });
  }

  appendSeparator(template);
  template.push(
    {
      label: 'Back',
      enabled: contents.navigationHistory.canGoBack(),
      click: () => contents.navigationHistory.goBack(),
    },
    {
      label: 'Forward',
      enabled: contents.navigationHistory.canGoForward(),
      click: () => contents.navigationHistory.goForward(),
    },
    { label: 'Reload', click: () => contents.reload() },
  );

  return template.filter((item, index, items) => {
    if (item.type !== 'separator') return true;
    const previous = items[index - 1];
    const next = items[index + 1];
    return Boolean(previous && next && previous.type !== 'separator' && next.type !== 'separator');
  });
}

function showBrowserContextMenu(contents: WebContents, params: ContextMenuParams): void {
  const template = buildBrowserContextMenu(contents, params);
  if (template.length === 0) return;
  Menu.buildFromTemplate(template).popup({ window: browserWindow ?? undefined });
}

function createBrowserView(): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/browserProvider.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      session: ensureBrowserSession(),
      webSecurity: true,
      safeDialogs: true,
    },
  });

  appendBrowserUserAgentProduct(view.webContents);

  view.webContents.setWindowOpenHandler(({ url }) => {
    void navigateBrowser(url);
    return { action: 'deny' };
  });

  view.webContents.on('context-menu', (_event, params) => {
    showBrowserContextMenu(view.webContents, params);
  });

  view.webContents.on('did-start-loading', () => {
    lastNavigationError = null;
    sendNavigationState(null);
  });
  view.webContents.on('did-stop-loading', () => sendNavigationState());
  view.webContents.on('did-navigate', () => {
    lastNavigationError = null;
    sendNavigationState(null);
  });
  view.webContents.on('did-navigate-in-page', () => sendNavigationState());
  view.webContents.on('page-title-updated', () => sendNavigationState());
  view.webContents.on('page-favicon-updated', (_event, favicons) => {
    if (favicons[0]) currentFaviconUrl = favicons[0];
    sendNavigationState();
  });
  view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return;
    lastNavigationError = `${validatedURL || 'Page'} failed to load: ${errorDescription}`;
    sendNavigationState(lastNavigationError);
  });

  return view;
}

function loadBrowserShell(window: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/browser.html`);
  } else {
    window.loadFile(join(__dirname, '../renderer/browser.html'));
  }
}

function loadBrowserModal(window: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/browser-modal.html`);
  } else {
    window.loadFile(join(__dirname, '../renderer/browser-modal.html'));
  }
}

function closeBrowserModal(): void {
  if (browserModalWindow && !browserModalWindow.isDestroyed()) {
    browserModalWindow.close();
  }
}

function centerBrowserModal(modal: BrowserWindow): void {
  if (!browserWindow || browserWindow.isDestroyed()) return;
  const parentBounds = browserWindow.getBounds();
  const modalBounds = modal.getBounds();
  modal.setBounds({
    x: Math.round(parentBounds.x + (parentBounds.width - modalBounds.width) / 2),
    y: Math.round(parentBounds.y + (parentBounds.height - modalBounds.height) / 2),
    width: modalBounds.width,
    height: modalBounds.height,
  });
}

function openBrowserModal(payload: BrowserModalPayload): BrowserWindow {
  if (!browserWindow || browserWindow.isDestroyed()) {
    throw new Error('Browser window is not initialized');
  }

  closeBrowserModal();
  browserModalPayload = payload;
  browserModalProviderRequestId = payload.kind === 'provider-request' ? payload.request.id : null;

  browserModalWindow = new BrowserWindow({
    title: payload.kind === 'provider-request' ? 'Wallet Authorization' : 'Connection Management',
    icon: getWindowIcon(),
    parent: browserWindow,
    modal: false,
    show: false,
    ...getWindowChromeOptions(),
    skipTaskbar: true,
    width: 520,
    height: payload.kind === 'provider-request' && payload.request.message ? 520 : 360,
    minWidth: 420,
    minHeight: 300,
    resizable: false,
    maximizable: false,
    minimizable: false,
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: join(__dirname, '../preload/browserModal.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const modal = browserModalWindow;
  const modalProviderRequestId = browserModalProviderRequestId;
  modal.once('ready-to-show', () => {
    if (modal.isDestroyed()) return;
    centerBrowserModal(modal);
    modal.show();
  });
  modal.on('closed', () => {
    if (modalProviderRequestId) {
      const pending = pendingProviderRequests.get(modalProviderRequestId);
      pending?.resolve({ approved: false });
      pendingProviderRequests.delete(modalProviderRequestId);
    }
    if (browserModalWindow === modal) {
      browserModalWindow = null;
      browserModalPayload = null;
      browserModalProviderRequestId = null;
    }
  });

  loadBrowserModal(modal);
  return modal;
}

async function navigateBrowser(
  inputUrl: string,
  options?: BrowserNavigateOptions,
): Promise<BrowserNavigationState> {
  if (options && Object.hasOwn(options, 'preferredAccountId')) {
    await setPreferredBrowserProviderAccount(options.preferredAccountId);
  }

  const contents = getViewContents();
  const previousState = await buildNavigationStateFromContents(contents, null);
  lastNavigationError = null;
  try {
    await contents.loadURL(normalizeBrowserUrl(inputUrl));
  } catch (err) {
    if (didBrowserCloseDuringNavigation(contents)) return previousState;
    if (!isNavigationAborted(err)) throw err;
  }
  if (didBrowserCloseDuringNavigation(contents)) return previousState;
  return await buildNavigationStateFromContents(contents, null);
}

function requestProviderApproval(
  request: Omit<BrowserProviderRequest, 'id'>,
): Promise<ProviderApproval> {
  if (!browserWindow || browserWindow.isDestroyed()) {
    return Promise.resolve({ approved: false });
  }

  const id = randomUUID();
  const prompt: BrowserProviderRequest = { ...request, id };

  return new Promise((resolve) => {
    pendingProviderRequests.set(id, { resolve });
    openBrowserModal({ kind: 'provider-request', request: prompt });
  });
}

function respondProviderRequest(input: BrowserProviderResponseInput): void {
  const pending = pendingProviderRequests.get(input.id);
  if (!pending) return;

  pendingProviderRequests.delete(input.id);
  browserModalProviderRequestId = null;
  pending.resolve(
    input.approved ? { approved: true, walletId: input.walletId } : { approved: false },
  );
  closeBrowserModal();
  setTimeout(() => sendNavigationState(), 0);
}

const promptDelegate: BrowserProviderPromptDelegate = {
  requestProviderApproval,
  respondProviderRequest,
};

function openBrowserWindow(): BrowserWindow {
  if (browserWindow && !browserWindow.isDestroyed()) {
    browserWindow.show();
    browserWindow.focus();
    return browserWindow;
  }

  browserWindow = new BrowserWindow({
    title: 'Polytrader2 Web Browser',
    icon: getWindowIcon(),
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    ...getWindowChromeOptions(),
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: join(__dirname, '../preload/browserShell.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  browserView = createBrowserView();
  browserWindow.contentView.addChildView(browserView);
  wireWindowStateEvents(browserWindow);

  browserWindow.on('closed', () => {
    closeBrowserModal();
    for (const pending of pendingProviderRequests.values()) {
      pending.resolve({ approved: false });
    }
    pendingProviderRequests.clear();
    browserWindow = null;
    browserView = null;
    lastNavigationError = null;
    currentFaviconUrl = null;
    disconnectAllAuthorizedProviderAccounts();
  });

  loadBrowserShell(browserWindow);
  void navigateBrowser(DEFAULT_BROWSER_URL).catch((err) => {
    if (!browserWindow || browserWindow.isDestroyed()) return;
    lastNavigationError = err instanceof Error ? err.message : String(err);
    sendNavigationState(lastNavigationError);
  });
  return browserWindow;
}

function closeBrowserWindow(): void {
  if (browserWindow && !browserWindow.isDestroyed()) {
    browserWindow.close();
  }
  browserWindow = null;
  browserView = null;
}

function registerBrowserWindowHandlers(ipcMain: IpcMain): void {
  registerBrowserProviderHandlers(ipcMain, promptDelegate);

  ipcMain.handle('browser-window:open', () => {
    openBrowserWindow();
  });
  ipcMain.handle(
    'browser-window:navigate',
    async (_event, url: string, options?: BrowserNavigateOptions) => {
      try {
        openBrowserWindow();
        return ok(await navigateBrowser(url, options));
      } catch (err) {
        return fail(err);
      }
    },
  );
  ipcMain.handle('browser-window:back', async () => {
    try {
      const contents = getViewContents();
      if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
      return ok(await buildNavigationState());
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain.handle('browser-window:forward', async () => {
    try {
      const contents = getViewContents();
      if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
      return ok(await buildNavigationState());
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain.handle('browser-window:reload', async () => {
    try {
      getViewContents().reload();
      return ok(await buildNavigationState());
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain.handle('browser-window:stop', async () => {
    try {
      getViewContents().stop();
      return ok(await buildNavigationState());
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain.handle('browser-window:getState', async () => {
    try {
      return ok(await buildNavigationState());
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain.handle('browser-window:disconnectWallet', async (event) => {
    try {
      if (!isBrowserShellEvent(event)) throw new Error('Invalid browser window request');
      const contents = getViewContents();
      disconnectAuthorizedProviderAccountsForUrl(contents.getURL());
      notifyRemoteProviderAccountsChanged([]);
      const state = await buildNavigationState();
      sendNavigationState();
      return ok(state);
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain.handle('browser-window:openConnectionDialog', async (event) => {
    try {
      if (!isBrowserShellEvent(event)) throw new Error('Invalid browser window request');
      const state = await buildNavigationState();
      if (!state.walletConnection.connected)
        throw new Error('The current site is not connected to a wallet');
      openBrowserModal({
        kind: 'connection-management',
        origin: getCurrentOrigin(),
        walletConnection: state.walletConnection,
      });
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain.handle('browser-window:setViewBounds', (event, bounds: BrowserViewBounds) => {
    try {
      if (!isBrowserShellEvent(event)) throw new Error('Invalid browser window request');
      if (!browserView) throw new Error('Browser page is not initialized');
      browserView.setBounds({
        x: Math.max(0, Math.round(bounds.x)),
        y: Math.max(0, Math.round(bounds.y)),
        width: Math.max(0, Math.round(bounds.width)),
        height: Math.max(0, Math.round(bounds.height)),
      });
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain.handle('browser-modal:getPayload', (event) => {
    try {
      if (!isBrowserModalEvent(event)) throw new Error('Invalid browser modal request');
      if (!browserModalPayload) throw new Error('Browser modal payload is missing');
      return ok(browserModalPayload);
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain.handle(
    'browser-modal:respondProviderRequest',
    (event, input: BrowserProviderResponseInput) => {
      try {
        if (!isBrowserModalEvent(event)) throw new Error('Invalid wallet confirmation request');
        respondProviderRequest(input);
        return ok(undefined);
      } catch (err) {
        return fail(err);
      }
    },
  );
  ipcMain.handle('browser-modal:disconnectWallet', async (event) => {
    try {
      if (!isBrowserModalEvent(event)) throw new Error('Invalid connection management request');
      const contents = getViewContents();
      disconnectAuthorizedProviderAccountsForUrl(contents.getURL());
      notifyRemoteProviderAccountsChanged([]);
      const state = await buildNavigationState();
      sendNavigationState();
      closeBrowserModal();
      return ok(state);
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain.handle('browser-modal:close', (event) => {
    if (!isBrowserModalEvent(event)) return;
    closeBrowserModal();
  });
}

export { closeBrowserWindow, openBrowserWindow, registerBrowserWindowHandlers };
