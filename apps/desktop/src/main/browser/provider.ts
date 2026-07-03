import { randomUUID } from 'crypto';
import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { isAddress, isHex, type Hex, type TypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type {
  BrowserProviderAccount,
  BrowserProviderRequest,
  BrowserProviderResponseInput,
  PolymarketWalletSummary,
} from '@polytrader/shared';
import type { PolymarketWalletCredential } from '@polytrader/polymarket-wallet';
import { polymarketWalletService } from '../services/polymarketWalletService.js';

interface ProviderListItem {
  id: string;
  name: string;
  walletAddress: string;
  chainId: number;
  isDefault: boolean;
  icon: string;
  rdns: string;
}

interface ProviderRpcRequest {
  providerAccountId?: string | null;
  method: string;
  params?: unknown;
}

type ProviderRpcResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: number; message: string; data?: unknown } };

type ProviderApproval = { approved: true; walletId?: string } | { approved: false };

interface BrowserProviderPromptDelegate {
  requestProviderApproval: (
    request: Omit<BrowserProviderRequest, 'id'>,
  ) => Promise<ProviderApproval>;
  respondProviderRequest: (input: BrowserProviderResponseInput) => void;
}

interface Eip712TypedDataPayload {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

const POLYGON_CHAIN_ID = 137;
const ICON_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyBmaWxsPSJub25lIiB2aWV3Qm94PSIwIDAgMjQgMjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiByeD0iNCIgZmlsbD0iIzA4MTExZiIgLz4KICA8cGF0aAogICAgZD0iTTMuNSAxOS40VjQuNmg3LjE1YzMuMjUgMCA1LjI1IDIgNS4yNSA0Ljg1IDAgMi45LTIgNC44NS01LjI1IDQuODVINy41NXY1LjFIMy41WiIKICAgIGZpbGw9IiNmOGZiZmYiCiAgLz4KICA8cGF0aCBkPSJNNy41NSA4djIuOWgyLjU1YzEuMDUgMCAxLjctLjU4IDEuNy0xLjQ1UzExLjE1IDggMTAuMSA4SDcuNTVaIiBmaWxsPSIjMDgxMTFmIiAvPgogIDxwYXRoCiAgICBkPSJNMTQuMjUgMTkuNHYtMi42bDMuOS0zLjM1YzEuMDUtLjkgMS40NS0xLjQgMS40NS0yLjA1IDAtLjctLjUtMS4xNS0xLjM1LTEuMTUtLjk1IDAtMS43LjQ4LTIuNjUgMS4zNWwtMS44NS0yLjQ1YzEuMjUtMS4zIDIuOC0yLjA1IDQuODUtMi4wNSAyLjg1IDAgNC43NSAxLjYgNC43NSAzLjkgMCAxLjc1LS43OCAyLjgtMi42IDQuMjVsLTEuNDUgMS4xNWg0LjE1djNoLTkuMloiCiAgICBmaWxsPSIjM2I4MmY2IgogIC8+Cjwvc3ZnPgo=';

const authorizedAccountsByOrigin = new Map<string, Set<string>>();
let preferredBrowserProviderAccountId: string | null = null;

class ProviderRpcError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ProviderRpcError';
    this.code = code;
    this.data = data;
  }
}

function rpcError(code: number, message: string, data?: unknown): ProviderRpcError {
  return new ProviderRpcError(code, message, data);
}

function normalizePrivateKey(privateKey: string): Hex {
  const trimmed = privateKey.trim();
  return (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as Hex;
}

function getAccountAddress(credential: Pick<PolymarketWalletCredential, 'privateKey'>): string {
  return privateKeyToAccount(normalizePrivateKey(credential.privateKey)).address;
}

function accountToProviderListItem(account: PolymarketWalletSummary): ProviderListItem {
  return {
    id: account.id,
    name: 'Polytrader2',
    walletAddress: account.walletAddress,
    chainId: account.chainId || POLYGON_CHAIN_ID,
    isDefault: account.isDefault,
    icon: ICON_DATA_URI,
    rdns: 'com.polytrader2.app',
  };
}

function accountToPromptAccount(account: PolymarketWalletSummary): BrowserProviderAccount {
  return {
    id: account.id,
    name: account.name,
    walletAddress: account.walletAddress,
    chainId: account.chainId || POLYGON_CHAIN_ID,
    isDefault: account.isDefault,
  };
}

async function listProviderAccounts(): Promise<ProviderListItem[]> {
  return sortPreferredAccounts(await polymarketWalletService.listPolymarketWallets()).map(
    accountToProviderListItem,
  );
}

async function listPromptAccounts(): Promise<BrowserProviderAccount[]> {
  return sortPreferredAccounts(await polymarketWalletService.listPolymarketWallets()).map(
    accountToPromptAccount,
  );
}

function sortPreferredAccounts<T extends { id: string }>(accounts: T[]): T[] {
  if (!preferredBrowserProviderAccountId) return accounts;
  return [...accounts].sort((left, right) => {
    if (left.id === preferredBrowserProviderAccountId) return -1;
    if (right.id === preferredBrowserProviderAccountId) return 1;
    return 0;
  });
}

async function setPreferredBrowserProviderAccount(walletId?: string | null): Promise<void> {
  const nextAccountId = walletId?.trim() || null;
  if (!nextAccountId) {
    preferredBrowserProviderAccountId = null;
    return;
  }

  const exists = (await polymarketWalletService.listPolymarketWallets()).some(
    (account) => account.id === nextAccountId,
  );
  preferredBrowserProviderAccountId = exists ? nextAccountId : null;
}

function getOriginFromUrl(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

async function getAuthorizedProviderAccountsForUrl(url: string): Promise<BrowserProviderAccount[]> {
  const origin = getOriginFromUrl(url);
  if (!origin) return [];

  const authorizedAccountIds = authorizedAccountsByOrigin.get(origin);
  if (!authorizedAccountIds?.size) return [];
  return (await listPromptAccounts()).filter((account) => authorizedAccountIds.has(account.id));
}

function disconnectAuthorizedProviderAccountsForUrl(url: string): void {
  const origin = getOriginFromUrl(url);
  if (!origin) return;
  authorizedAccountsByOrigin.delete(origin);
}

function disconnectAllAuthorizedProviderAccounts(): void {
  authorizedAccountsByOrigin.clear();
}

function getRequestUrl(contents: WebContents): string {
  return contents.getURL() || 'about:blank';
}

function getRequestOrigin(contents: WebContents): string {
  const url = getRequestUrl(contents);
  try {
    return new URL(url).origin;
  } catch {
    return 'unknown';
  }
}

function isOriginAuthorized(origin: string, walletId: string): boolean {
  return authorizedAccountsByOrigin.get(origin)?.has(walletId) === true;
}

function authorizeOrigin(origin: string, walletId: string): void {
  const existing = authorizedAccountsByOrigin.get(origin);
  if (existing) {
    existing.add(walletId);
  } else {
    authorizedAccountsByOrigin.set(origin, new Set([walletId]));
  }
}

function revokeOrigin(origin: string, walletId: string): void {
  const existing = authorizedAccountsByOrigin.get(origin);
  if (!existing) return;
  existing.delete(walletId);
  if (!existing.size) authorizedAccountsByOrigin.delete(origin);
}

async function getPreferredAccountId(providerAccountId?: string | null): Promise<string | null> {
  if (providerAccountId) return providerAccountId;
  if (
    preferredBrowserProviderAccountId &&
    (await polymarketWalletService.listPolymarketWallets()).some(
      (account) => account.id === preferredBrowserProviderAccountId,
    )
  ) {
    return preferredBrowserProviderAccountId;
  }
  const defaultCredential = await polymarketWalletService.getDefaultPolymarketWalletCredential();
  return defaultCredential?.id ?? null;
}

async function getCredentialForProvider(
  providerAccountId?: string | null,
): Promise<PolymarketWalletCredential> {
  const walletId = await getPreferredAccountId(providerAccountId);
  if (!walletId) throw rpcError(4900, 'No wallet account is available');
  return polymarketWalletService.getPolymarketWalletCredential(walletId);
}

function getHexChainId(chainId: number): string {
  return `0x${Math.max(1, Number(chainId) || POLYGON_CHAIN_ID).toString(16)}`;
}

function normalizeParams(params: unknown): unknown[] {
  if (params == null) return [];
  return Array.isArray(params) ? params : [params];
}

function stringifyForPreview(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function truncatePreview(value: string): string {
  return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
}

function parsePersonalSignParams(params: unknown): { address: string; message: string } {
  const values = normalizeParams(params);
  const first = values[0];
  const second = values[1];

  if (typeof first === 'string' && isAddress(first) && typeof second === 'string') {
    return { address: first, message: second };
  }
  if (typeof second === 'string' && isAddress(second) && typeof first === 'string') {
    return { address: second, message: first };
  }

  throw rpcError(4200, 'Invalid personal_sign parameters');
}

function parseTypedDataParams(params: unknown): {
  address: string;
  typedData: Eip712TypedDataPayload;
} {
  const values = normalizeParams(params);
  const [first, second] = values;
  if (typeof first !== 'string' || !isAddress(first)) {
    throw rpcError(4200, 'Invalid eth_signTypedData_v4 address parameter');
  }

  let parsed: unknown;
  try {
    parsed = typeof second === 'string' ? (JSON.parse(second) as Record<string, unknown>) : second;
  } catch {
    throw rpcError(4200, 'Invalid eth_signTypedData_v4 JSON payload');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw rpcError(4200, 'Invalid eth_signTypedData_v4 typed data parameter');
  }
  const typedData = parsed as Record<string, unknown>;
  if (
    typeof typedData.primaryType !== 'string' ||
    !typedData.types ||
    typeof typedData.types !== 'object' ||
    !typedData.message ||
    typeof typedData.message !== 'object'
  ) {
    throw rpcError(4200, 'Invalid eth_signTypedData_v4 typed data shape');
  }

  return {
    address: first,
    typedData: {
      domain:
        typedData.domain && typeof typedData.domain === 'object'
          ? (typedData.domain as Record<string, unknown>)
          : {},
      types: typedData.types as Record<string, Array<{ name: string; type: string }>>,
      primaryType: typedData.primaryType,
      message: typedData.message as Record<string, unknown>,
    },
  };
}

function assertRequestedAddressMatches(
  credential: PolymarketWalletCredential,
  address: string,
): void {
  if (getAccountAddress(credential).toLowerCase() !== address.toLowerCase()) {
    throw rpcError(4100, 'Requested address does not match this wallet provider');
  }
}

function getAuthorizationPermissions(
  origin: string,
  credential: PolymarketWalletCredential,
): unknown[] {
  if (!isOriginAuthorized(origin, credential.id)) return [];
  return [
    {
      id: randomUUID(),
      parentCapability: 'eth_accounts',
      invoker: origin,
      caveats: [
        {
          type: 'restrictReturnedAccounts',
          value: [getAccountAddress(credential)],
        },
      ],
    },
  ];
}

function shouldRevokeAccountsPermission(params: unknown): boolean {
  const [target] = normalizeParams(params) as Array<Record<string, unknown> | undefined>;
  if (!target) return true;
  return Object.hasOwn(target, 'eth_accounts');
}

async function requestAccountAccess(
  contents: WebContents,
  providerAccountId: string | null | undefined,
  delegate: BrowserProviderPromptDelegate,
): Promise<PolymarketWalletCredential> {
  const origin = getRequestOrigin(contents);
  const preferredAccountId = await getPreferredAccountId(providerAccountId);
  if (!preferredAccountId) throw rpcError(4900, 'No wallet account is available');

  if (isOriginAuthorized(origin, preferredAccountId)) {
    return await polymarketWalletService.getPolymarketWalletCredential(preferredAccountId);
  }

  const accounts = await listPromptAccounts();
  const targetAccount = accounts.find((account) => account.id === preferredAccountId);
  const approval = await delegate.requestProviderApproval({
    origin,
    url: getRequestUrl(contents),
    method: 'eth_requestAccounts',
    kind: 'connect',
    accounts: targetAccount ? [targetAccount] : accounts,
    walletId: preferredAccountId,
    rawParams: [],
  });

  if (!approval.approved) throw rpcError(4001, 'User rejected the request');

  const approvedAccountId = approval.walletId || preferredAccountId;
  const credential = await polymarketWalletService.getPolymarketWalletCredential(approvedAccountId);
  authorizeOrigin(origin, credential.id);
  return credential;
}

async function requestSignatureApproval(
  contents: WebContents,
  credential: PolymarketWalletCredential,
  method: string,
  params: unknown,
  message: string,
  delegate: BrowserProviderPromptDelegate,
): Promise<void> {
  const approval = await delegate.requestProviderApproval({
    origin: getRequestOrigin(contents),
    url: getRequestUrl(contents),
    method,
    kind: 'sign',
    accounts: await listPromptAccounts(),
    walletId: credential.id,
    walletName: credential.name,
    accountAddress: getAccountAddress(credential),
    message: truncatePreview(message),
    rawParams: params,
  });

  if (!approval.approved) throw rpcError(4001, 'User rejected the request');
}

async function signPersonalMessage(
  contents: WebContents,
  providerAccountId: string | null | undefined,
  params: unknown,
  delegate: BrowserProviderPromptDelegate,
): Promise<string> {
  const origin = getRequestOrigin(contents);
  const credential = await getCredentialForProvider(providerAccountId);
  if (!isOriginAuthorized(origin, credential.id)) {
    throw rpcError(4100, 'The requested account has not been authorized');
  }

  const { address, message } = parsePersonalSignParams(params);
  assertRequestedAddressMatches(credential, address);
  await requestSignatureApproval(contents, credential, 'personal_sign', params, message, delegate);

  const account = privateKeyToAccount(normalizePrivateKey(credential.privateKey));
  return account.signMessage({
    message: isHex(message) ? { raw: message as Hex } : message,
  });
}

async function signTypedData(
  contents: WebContents,
  providerAccountId: string | null | undefined,
  method: string,
  params: unknown,
  delegate: BrowserProviderPromptDelegate,
): Promise<string> {
  const origin = getRequestOrigin(contents);
  const credential = await getCredentialForProvider(providerAccountId);
  if (!isOriginAuthorized(origin, credential.id)) {
    throw rpcError(4100, 'The requested account has not been authorized');
  }

  const { address, typedData } = parseTypedDataParams(params);
  assertRequestedAddressMatches(credential, address);
  await requestSignatureApproval(
    contents,
    credential,
    method,
    params,
    stringifyForPreview(typedData),
    delegate,
  );

  const account = privateKeyToAccount(normalizePrivateKey(credential.privateKey));
  const types = { ...typedData.types };
  delete types.EIP712Domain;

  return account.signTypedData({
    domain: typedData.domain,
    types: types as unknown as TypedData,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });
}

async function handleProviderRequest(
  contents: WebContents,
  request: ProviderRpcRequest,
  delegate: BrowserProviderPromptDelegate,
): Promise<unknown> {
  const method = request.method;
  const credential = await getCredentialForProvider(request.providerAccountId);
  const origin = getRequestOrigin(contents);

  switch (method) {
    case 'eth_chainId':
      return getHexChainId(credential.chainId);
    case 'net_version':
      return String(credential.chainId || POLYGON_CHAIN_ID);
    case 'eth_accounts':
      return isOriginAuthorized(origin, credential.id) ? [getAccountAddress(credential)] : [];
    case 'eth_coinbase':
      return isOriginAuthorized(origin, credential.id) ? getAccountAddress(credential) : null;
    case 'eth_requestAccounts': {
      const approvedCredential = await requestAccountAccess(
        contents,
        request.providerAccountId,
        delegate,
      );
      return [getAccountAddress(approvedCredential)];
    }
    case 'wallet_getPermissions':
      return getAuthorizationPermissions(origin, credential);
    case 'wallet_requestPermissions': {
      const approvedCredential = await requestAccountAccess(
        contents,
        request.providerAccountId,
        delegate,
      );
      return getAuthorizationPermissions(origin, approvedCredential);
    }
    case 'wallet_revokePermissions':
      if (shouldRevokeAccountsPermission(request.params)) {
        revokeOrigin(origin, credential.id);
      }
      return null;
    case 'personal_sign':
      return signPersonalMessage(contents, request.providerAccountId, request.params, delegate);
    case 'eth_signTypedData':
    case 'eth_signTypedData_v3':
    case 'eth_signTypedData_v4':
      return signTypedData(contents, request.providerAccountId, method, request.params, delegate);
    case 'wallet_switchEthereumChain': {
      const [target] = normalizeParams(request.params) as Array<{ chainId?: string }>;
      if (!target?.chainId || target.chainId.toLowerCase() === getHexChainId(credential.chainId)) {
        return null;
      }
      throw rpcError(4901, 'This wallet provider is only connected to Polygon');
    }
    case 'eth_sendTransaction':
    case 'eth_sign':
    case 'eth_signTransaction':
    case 'wallet_addEthereumChain':
      throw rpcError(4200, `${method} is not supported`);
    default:
      throw rpcError(4200, `${method} is not supported`);
  }
}

function serializeError(err: unknown): ProviderRpcResult {
  if (err instanceof ProviderRpcError) {
    return {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        data: err.data,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: 4900,
      message: err instanceof Error ? err.message : String(err),
    },
  };
}

function registerBrowserProviderHandlers(
  ipcMain: IpcMain,
  delegate: BrowserProviderPromptDelegate,
): void {
  ipcMain.handle('wallet-provider:listProviders', () => listProviderAccounts());
  ipcMain.handle(
    'wallet-provider:request',
    async (event: IpcMainInvokeEvent, request: ProviderRpcRequest): Promise<ProviderRpcResult> => {
      try {
        const data = await handleProviderRequest(event.sender, request, delegate);
        if (
          request.method === 'wallet_requestPermissions' ||
          request.method === 'eth_requestAccounts' ||
          request.method === 'personal_sign' ||
          request.method.startsWith('eth_signTypedData')
        ) {
          console.info('[wallet-provider:request ok]', {
            method: request.method,
            origin: getRequestOrigin(event.sender),
          });
        }
        return { ok: true, data };
      } catch (err) {
        const result = serializeError(err) as Extract<ProviderRpcResult, { ok: false }>;
        console.warn('[wallet-provider:request failed]', {
          method: request.method,
          origin: getRequestOrigin(event.sender),
          code: result.error.code,
          message: result.error.message,
          data: result.error.data,
        });
        return result;
      }
    },
  );
}

export {
  disconnectAllAuthorizedProviderAccounts,
  disconnectAuthorizedProviderAccountsForUrl,
  getAuthorizedProviderAccountsForUrl,
  registerBrowserProviderHandlers,
  setPreferredBrowserProviderAccount,
};
export type {
  BrowserProviderPromptDelegate,
  ProviderApproval,
  ProviderListItem,
  ProviderRpcRequest,
  ProviderRpcResult,
};
