import { contextBridge, ipcRenderer, webFrame } from 'electron';

interface ProviderListItem {
  id: string;
  name: string;
  walletAddress: string;
  chainId: number;
  isDefault: boolean;
  icon: string;
  rdns: string;
}

interface ProviderRpcResult {
  ok: boolean;
  data?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface RequestArguments {
  method: string;
  params?: unknown;
}

function createProviderError(error: ProviderRpcResult['error']): Error & {
  code?: number;
  data?: unknown;
} {
  const err = new Error(error?.message || 'Provider request failed') as Error & {
    code?: number;
    data?: unknown;
  };
  err.code = error?.code ?? 4900;
  err.data = error?.data;
  return err;
}

const bridge = {
  listProviders: () =>
    ipcRenderer.invoke('wallet-provider:listProviders') as Promise<ProviderListItem[]>,
  request: async (providerAccountId: string, args: RequestArguments): Promise<unknown> => {
    const result = (await ipcRenderer.invoke('wallet-provider:request', {
      providerAccountId,
      method: args.method,
      params: args.params,
    })) as ProviderRpcResult;

    if (!result.ok) throw createProviderError(result.error);
    return result.data;
  },
};

function installProviderInPage(): void {
  const pageWindow = window as typeof window & {
    __fbEthereumProviderBridge?: {
      listProviders: () => Promise<ProviderListItem[]>;
      request: (providerAccountId: string, args: RequestArguments) => Promise<unknown>;
    };
    __fbPolymarketDesktopInjected?: boolean;
    __fbPolymarketDesktopSetAccounts?: (accounts: string[]) => void;
    ethereum?: unknown;
  };

  if (pageWindow.__fbPolymarketDesktopInjected) return;
  pageWindow.__fbPolymarketDesktopInjected = true;

  const bridgeApi = pageWindow.__fbEthereumProviderBridge!;
  if (!bridgeApi) return;

  type Listener = (...args: unknown[]) => void;

  const detailsByAccountId = new Map<string, { info: unknown; provider: unknown }>();
  const providerControlsByAccountId = new Map<
    string,
    { setAccounts: (accounts: string[]) => void }
  >();

  function toHexChainId(chainId: number): string {
    return `0x${Math.max(1, Number(chainId) || 137).toString(16)}`;
  }

  function createProvider(account: ProviderListItem) {
    const listeners = new Map<string, Set<Listener>>();
    let selectedAccounts: string[] = [];
    const chainId = toHexChainId(account.chainId);

    function emit(eventName: string, ...args: unknown[]): void {
      const eventListeners = listeners.get(eventName);
      if (!eventListeners) return;
      for (const listener of [...eventListeners]) {
        try {
          listener(...args);
        } catch (err) {
          setTimeout(() => {
            throw err;
          }, 0);
        }
      }
    }

    function areAccountsEqual(left: string[], right: string[]): boolean {
      return (
        left.length === right.length && left.every((account, index) => account === right[index])
      );
    }

    function setAccounts(accounts: string[], emitChange: boolean): void {
      if (areAccountsEqual(selectedAccounts, accounts)) return;
      selectedAccounts = accounts;
      if (emitChange) emit('accountsChanged', [...selectedAccounts]);
    }

    const provider = {
      isPolymarketDesktop: true,
      isConnected: () => true,
      request: async (args: RequestArguments): Promise<unknown> => {
        if (!args || typeof args.method !== 'string') {
          const err = new Error('Invalid EIP-1193 request') as Error & { code?: number };
          err.code = 4200;
          throw err;
        }

        const result = await bridgeApi.request(account.id, args);
        if (args.method === 'eth_requestAccounts') {
          setAccounts(Array.isArray(result) ? (result as string[]) : [], true);
        }
        if (args.method === 'eth_accounts') {
          setAccounts(Array.isArray(result) ? (result as string[]) : [], false);
        }
        if (args.method === 'wallet_requestPermissions') {
          const accounts = await bridgeApi.request(account.id, { method: 'eth_accounts' });
          setAccounts(Array.isArray(accounts) ? (accounts as string[]) : [], true);
        }
        if (args.method === 'wallet_revokePermissions') {
          const accounts = await bridgeApi.request(account.id, { method: 'eth_accounts' });
          setAccounts(Array.isArray(accounts) ? (accounts as string[]) : [], true);
        }
        return result;
      },
      on: (eventName: string, listener: Listener) => {
        const eventListeners = listeners.get(eventName) ?? new Set<Listener>();
        eventListeners.add(listener);
        listeners.set(eventName, eventListeners);
        return provider;
      },
      addListener: (eventName: string, listener: Listener) => {
        return provider.on(eventName, listener);
      },
      removeListener: (eventName: string, listener: Listener) => {
        listeners.get(eventName)?.delete(listener);
        return provider;
      },
      off: (eventName: string, listener: Listener) => {
        return provider.removeListener(eventName, listener);
      },
    };

    Object.defineProperties(provider, {
      chainId: {
        enumerable: true,
        get: () => chainId,
      },
      selectedAddress: {
        enumerable: true,
        get: () => selectedAccounts[0] ?? null,
      },
    });

    setTimeout(() => {
      emit('connect', { chainId });
      void provider.request({ method: 'eth_accounts' });
    }, 0);

    providerControlsByAccountId.set(account.id, {
      setAccounts: (accounts) => setAccounts(accounts, true),
    });
    return Object.freeze(provider);
  }

  function getOrCreateDetail(account: ProviderListItem) {
    const existing = detailsByAccountId.get(account.id);
    if (existing) return existing;

    const provider = createProvider(account);
    const detail = Object.freeze({
      info: Object.freeze({
        uuid: account.id,
        name: account.name,
        icon: account.icon,
        rdns: account.rdns,
      }),
      provider,
    });

    detailsByAccountId.set(account.id, detail);
    return detail;
  }

  async function getProviderDetails() {
    const providers = await bridgeApi.listProviders();
    return providers.map(getOrCreateDetail);
  }

  function announce(detail: { info: unknown; provider: unknown }): void {
    pageWindow.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
  }

  async function announceAll(): Promise<void> {
    const details = await getProviderDetails();
    const defaultProvider = details[0]?.provider;

    if (defaultProvider) {
      pageWindow.ethereum = defaultProvider;
    }

    for (const detail of details) announce(detail);
  }

  pageWindow.addEventListener('eip6963:requestProvider', () => {
    void announceAll();
  });
  pageWindow.__fbPolymarketDesktopSetAccounts = (accounts) => {
    for (const control of providerControlsByAccountId.values()) {
      control.setAccounts(accounts);
    }
  };
  void announceAll();
}

contextBridge.exposeInMainWorld('__fbEthereumProviderBridge', bridge);
void webFrame.executeJavaScript(`(${installProviderInPage.toString()})();`);
