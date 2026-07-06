import { randomUUID } from 'crypto';
import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import {
  createPublicClient,
  createWalletClient,
  decodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  isAddress,
  isHex,
  maxUint256,
  toHex,
  type Address,
  type Hex,
  type TransactionReceipt,
  type TypedData,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import type {
  BrowserProviderAccount,
  BrowserProviderRequest,
  BrowserProviderTransactionPreview,
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
const POLYGON_CHAIN_ID_HEX = '0x89';
const POLYGON_RPC_URL =
  'https://rpc.ankr.com/polygon/bf9531582446e046f694030863e09ba066b556226edcbf2c916c8d1ca4226435';
const EIP5792_VERSION = '2.0.0';
const MAX_WALLET_CALLS = 20;
const ICON_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyBmaWxsPSJub25lIiB2aWV3Qm94PSIwIDAgMjQgMjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiByeD0iNCIgZmlsbD0iIzA4MTExZiIgLz4KICA8cGF0aAogICAgZD0iTTMuNSAxOS40VjQuNmg3LjE1YzMuMjUgMCA1LjI1IDIgNS4yNSA0Ljg1IDAgMi45LTIgNC44NS01LjI1IDQuODVINy41NXY1LjFIMy41WiIKICAgIGZpbGw9IiNmOGZiZmYiCiAgLz4KICA8cGF0aCBkPSJNNy41NSA4djIuOWgyLjU1YzEuMDUgMCAxLjctLjU4IDEuNy0xLjQ1UzExLjE1IDggMTAuMSA4SDcuNTVaIiBmaWxsPSIjMDgxMTFmIiAvPgogIDxwYXRoCiAgICBkPSJNMTQuMjUgMTkuNHYtMi42bDMuOS0zLjM1YzEuMDUtLjkgMS40NS0xLjQgMS40NS0yLjA1IDAtLjctLjUtMS4xNS0xLjM1LTEuMTUtLjk1IDAtMS43LjQ4LTIuNjUgMS4zNWwtMS44NS0yLjQ1YzEuMjUtMS4zIDIuOC0yLjA1IDQuODUtMi4wNSAyLjg1IDAgNC43NSAxLjYgNC43NSAzLjkgMCAxLjc1LS43OCAyLjgtMi42IDQuMjVsLTEuNDUgMS4xNWg0LjE1djNoLTkuMloiCiAgICBmaWxsPSIjM2I4MmY2IgogIC8+Cjwvc3ZnPgo=';

const authorizedAccountsByOrigin = new Map<string, Set<string>>();
const callBundlesById = new Map<string, WalletCallBundleStatus>();
let preferredBrowserProviderAccountId: string | null = null;

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(POLYGON_RPC_URL),
});

type WalletCapability = Record<string, unknown> & { optional?: boolean };

interface WalletSendCall {
  to?: Address;
  data?: Hex;
  value?: Hex;
  capabilities?: Record<string, WalletCapability>;
}

interface WalletSendCallsParams {
  version: string;
  id: string;
  from?: Address;
  chainId: Hex;
  atomicRequired: boolean;
  calls: WalletSendCall[];
  capabilities?: Record<string, WalletCapability>;
}

interface WalletCallReceipt {
  logs: Array<{
    address: Address;
    data: Hex;
    topics: Hex[];
  }>;
  status: Hex;
  blockHash: Hex;
  blockNumber: Hex;
  gasUsed: Hex;
  transactionHash: Hex;
}

interface WalletCallBundleStatus {
  version: string;
  id: string;
  chainId: Hex;
  status: number;
  atomic: boolean;
  receipts?: WalletCallReceipt[];
}

interface EthTransactionParams {
  from?: Address;
  to?: Address;
  data?: Hex;
  value?: Hex;
  gas?: Hex;
  gasPrice?: Hex;
  maxFeePerGas?: Hex;
  maxPriorityFeePerGas?: Hex;
  nonce?: Hex;
}

interface Erc20TransactionMetadata {
  name?: string;
  symbol?: string;
  decimals: number;
}

class ProviderRpcError extends Error {
  public code: number;
  public data?: unknown;

  public constructor(code: number, message: string, data?: unknown) {
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

function getPolygonChainIdHex(): Hex {
  return POLYGON_CHAIN_ID_HEX as Hex;
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

function bigintFromHex(value: Hex | undefined): bigint | undefined {
  if (!value) return undefined;
  return BigInt(value);
}

function normalizeHex(value: unknown, fieldName: string, fallback?: Hex): Hex | undefined {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string' || !isHex(value)) {
    throw rpcError(-32602, `Invalid ${fieldName}`);
  }
  return value as Hex;
}

function normalizeAddress(value: unknown, fieldName: string): Address | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || !isAddress(value)) {
    throw rpcError(-32602, `Invalid ${fieldName}`);
  }
  return value as Address;
}

function assertPolygonChainId(chainId: Hex): void {
  if (chainId.toLowerCase() !== getPolygonChainIdHex()) {
    throw rpcError(5710, 'This wallet provider only supports Polygon');
  }
}

function assertNoUnsupportedCapabilities(
  capabilities: Record<string, WalletCapability> | undefined,
): void {
  if (!capabilities) return;
  for (const [name, capability] of Object.entries(capabilities)) {
    if (name === 'atomic') continue;
    if (capability?.optional === true) continue;
    throw rpcError(5700, `Unsupported non-optional capability: ${name}`);
  }
}

function normalizeWalletCall(value: unknown, index: number): WalletSendCall {
  if (!value || typeof value !== 'object') {
    throw rpcError(-32602, `Invalid wallet_sendCalls call at index ${index}`);
  }
  const raw = value as Record<string, unknown>;
  const call: WalletSendCall = {
    to: normalizeAddress(raw.to, `wallet_sendCalls.calls[${index}].to`),
    data: normalizeHex(raw.data, `wallet_sendCalls.calls[${index}].data`),
    value: normalizeHex(raw.value, `wallet_sendCalls.calls[${index}].value`, '0x0'),
    capabilities: raw.capabilities as Record<string, WalletCapability> | undefined,
  };
  assertNoUnsupportedCapabilities(call.capabilities);
  return call;
}

function parseWalletSendCallsParams(params: unknown): WalletSendCallsParams {
  const [input] = normalizeParams(params);
  if (!input || typeof input !== 'object') {
    throw rpcError(-32602, 'Invalid wallet_sendCalls parameters');
  }

  const raw = input as Record<string, unknown>;
  const chainId = normalizeHex(raw.chainId, 'wallet_sendCalls.chainId');
  if (!chainId) throw rpcError(-32602, 'Missing wallet_sendCalls.chainId');
  assertPolygonChainId(chainId);
  if (raw.atomicRequired !== false) {
    throw rpcError(5760, 'Atomic execution is not supported');
  }
  if (!Array.isArray(raw.calls) || raw.calls.length === 0) {
    throw rpcError(-32602, 'wallet_sendCalls.calls must contain at least one call');
  }
  if (raw.calls.length > MAX_WALLET_CALLS) {
    throw rpcError(5740, 'Call bundle is too large');
  }

  const id =
    typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : `0x${randomUUID().replaceAll('-', '')}`;
  if (callBundlesById.has(id))
    throw rpcError(5720, 'There is already a bundle submitted with this id');
  assertNoUnsupportedCapabilities(raw.capabilities as Record<string, WalletCapability> | undefined);

  return {
    version:
      typeof raw.version === 'string' && raw.version.trim() ? raw.version.trim() : EIP5792_VERSION,
    id,
    from: normalizeAddress(raw.from, 'wallet_sendCalls.from'),
    chainId,
    atomicRequired: false,
    calls: raw.calls.map((call, index) => normalizeWalletCall(call, index)),
    capabilities: raw.capabilities as Record<string, WalletCapability> | undefined,
  };
}

function parseEthTransactionParams(params: unknown): EthTransactionParams {
  const [input] = normalizeParams(params);
  if (!input || typeof input !== 'object') {
    throw rpcError(-32602, 'Invalid eth_sendTransaction parameters');
  }

  const raw = input as Record<string, unknown>;
  return {
    from: normalizeAddress(raw.from, 'eth_sendTransaction.from'),
    to: normalizeAddress(raw.to, 'eth_sendTransaction.to'),
    data: normalizeHex(raw.data, 'eth_sendTransaction.data'),
    value: normalizeHex(raw.value, 'eth_sendTransaction.value', '0x0'),
    gas: normalizeHex(raw.gas, 'eth_sendTransaction.gas'),
    gasPrice: normalizeHex(raw.gasPrice, 'eth_sendTransaction.gasPrice'),
    maxFeePerGas: normalizeHex(raw.maxFeePerGas, 'eth_sendTransaction.maxFeePerGas'),
    maxPriorityFeePerGas: normalizeHex(
      raw.maxPriorityFeePerGas,
      'eth_sendTransaction.maxPriorityFeePerGas',
    ),
    nonce: normalizeHex(raw.nonce, 'eth_sendTransaction.nonce'),
  };
}

async function buildEthTransactionPreview(
  transaction: EthTransactionParams,
): Promise<BrowserProviderTransactionPreview> {
  const nativeValue = bigintFromHex(transaction.value) ?? 0n;
  if (transaction.to && transaction.data) {
    const erc20Preview = await buildErc20TransactionPreview(transaction, nativeValue);
    if (erc20Preview) return erc20Preview;
    return {
      kind: 'contract-call',
      actionLabel: 'Contract Call',
      from: transaction.from,
      contractAddress: transaction.to,
      nativeValueFormatted: formatUnits(nativeValue, 18),
    };
  }

  return {
    kind: 'native-transfer',
    actionLabel: 'Native Transfer',
    from: transaction.from,
    to: transaction.to,
    nativeValueFormatted: formatUnits(nativeValue, 18),
  };
}

async function buildErc20TransactionPreview(
  transaction: EthTransactionParams,
  nativeValue: bigint,
): Promise<BrowserProviderTransactionPreview | null> {
  if (!transaction.to || !transaction.data || nativeValue !== 0n) return null;

  try {
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: transaction.data,
    });
    if (decoded.functionName !== 'transfer' && decoded.functionName !== 'approve') return null;

    const metadata = await readErc20TransactionMetadata(transaction.to);
    const [target, rawAmount] = decoded.args as [Address, bigint];
    const amountFormatted = formatTokenAmount(rawAmount, metadata.decimals);

    if (decoded.functionName === 'transfer') {
      return {
        kind: 'erc20-transfer',
        tokenAddress: transaction.to,
        tokenName: metadata.name,
        tokenSymbol: metadata.symbol,
        tokenDecimals: metadata.decimals,
        actionLabel: 'ERC20 Transfer',
        amountRaw: rawAmount.toString(),
        amountFormatted,
        from: transaction.from,
        to: target,
        method: decoded.functionName,
      };
    }

    return {
      kind: 'erc20-approve',
      tokenAddress: transaction.to,
      tokenName: metadata.name,
      tokenSymbol: metadata.symbol,
      tokenDecimals: metadata.decimals,
      actionLabel: 'ERC20 Approval',
      amountRaw: rawAmount.toString(),
      amountFormatted: rawAmount === maxUint256 ? 'Unlimited' : amountFormatted,
      from: transaction.from,
      spender: target,
      method: decoded.functionName,
    };
  } catch {
    return null;
  }
}

async function readErc20TransactionMetadata(
  tokenAddress: Address,
): Promise<Erc20TransactionMetadata> {
  const [symbol, decimals, name] = await Promise.all([
    publicClient
      .readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'symbol' })
      .catch(() => undefined),
    publicClient
      .readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' })
      .catch(() => undefined),
    publicClient
      .readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'name' })
      .catch(() => undefined),
  ]);

  return {
    name: typeof name === 'string' && name.trim() ? name.trim() : undefined,
    symbol: typeof symbol === 'string' && symbol.trim() ? symbol.trim() : undefined,
    decimals: typeof decimals === 'number' && Number.isFinite(decimals) ? decimals : 18,
  };
}

function formatTokenAmount(value: bigint, decimals: number): string {
  const formatted = formatUnits(value, decimals);
  if (!formatted.includes('.')) return formatted;
  return formatted.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

function receiptToWalletCallReceipt(receipt: TransactionReceipt): WalletCallReceipt {
  return {
    logs: receipt.logs.map((log) => ({
      address: log.address,
      data: log.data,
      topics: [...log.topics],
    })),
    status: receipt.status === 'success' ? '0x1' : '0x0',
    blockHash: receipt.blockHash,
    blockNumber: toHex(receipt.blockNumber),
    gasUsed: toHex(receipt.gasUsed),
    transactionHash: receipt.transactionHash,
  };
}

function buildTransactionPreview(input: unknown): string {
  return truncatePreview(stringifyForPreview(input));
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

async function requestTransactionApproval(
  contents: WebContents,
  credential: PolymarketWalletCredential,
  method: string,
  params: unknown,
  transactionPreview: BrowserProviderTransactionPreview | undefined,
  delegate: BrowserProviderPromptDelegate,
): Promise<void> {
  const approval = await delegate.requestProviderApproval({
    origin: getRequestOrigin(contents),
    url: getRequestUrl(contents),
    method,
    kind: 'transaction',
    accounts: await listPromptAccounts(),
    walletId: credential.id,
    walletName: credential.name,
    accountAddress: getAccountAddress(credential),
    message: buildTransactionPreview(params),
    transactionPreview,
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

function assertTransactionAccountAuthorized(
  origin: string,
  credential: PolymarketWalletCredential,
  from?: Address,
): Address {
  if (!isOriginAuthorized(origin, credential.id)) {
    throw rpcError(4100, 'The requested account has not been authorized');
  }
  const address = getAccountAddress(credential) as Address;
  if (from) assertRequestedAddressMatches(credential, from);
  return address;
}

function createWalletRpcClient(credential: PolymarketWalletCredential) {
  return createWalletClient({
    account: privateKeyToAccount(normalizePrivateKey(credential.privateKey)),
    chain: polygon,
    transport: http(POLYGON_RPC_URL),
  });
}

function buildWalletTransactionRequest(transaction: EthTransactionParams) {
  const request: {
    to?: Address;
    data?: Hex;
    value?: bigint;
    gas?: bigint;
    gasPrice?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    nonce?: number;
  } = {};

  if (transaction.to) request.to = transaction.to;
  if (transaction.data) request.data = transaction.data;
  const value = bigintFromHex(transaction.value);
  if (value !== undefined) request.value = value;
  const gas = bigintFromHex(transaction.gas);
  if (gas !== undefined) request.gas = gas;
  const nonce =
    transaction.nonce === undefined ? undefined : Number.parseInt(transaction.nonce.slice(2), 16);
  if (nonce !== undefined) request.nonce = nonce;

  const maxFeePerGas = bigintFromHex(transaction.maxFeePerGas);
  const maxPriorityFeePerGas = bigintFromHex(transaction.maxPriorityFeePerGas);
  if (maxFeePerGas !== undefined || maxPriorityFeePerGas !== undefined) {
    if (maxFeePerGas !== undefined) request.maxFeePerGas = maxFeePerGas;
    if (maxPriorityFeePerGas !== undefined) request.maxPriorityFeePerGas = maxPriorityFeePerGas;
    return request;
  }

  const gasPrice = bigintFromHex(transaction.gasPrice);
  if (gasPrice !== undefined) request.gasPrice = gasPrice;
  return request;
}

function buildWalletCallTransactionRequest(call: WalletSendCall) {
  const request: {
    to?: Address;
    data?: Hex;
    value?: bigint;
  } = {};
  if (call.to) request.to = call.to;
  if (call.data) request.data = call.data;
  const value = bigintFromHex(call.value);
  if (value !== undefined) request.value = value;
  return request;
}

async function sendEthTransaction(
  contents: WebContents,
  credential: PolymarketWalletCredential,
  params: unknown,
  delegate: BrowserProviderPromptDelegate,
): Promise<Hex> {
  const origin = getRequestOrigin(contents);
  const transaction = parseEthTransactionParams(params);
  assertTransactionAccountAuthorized(origin, credential, transaction.from);
  const transactionPreview = await buildEthTransactionPreview(transaction);
  await requestTransactionApproval(
    contents,
    credential,
    'eth_sendTransaction',
    transaction,
    transactionPreview,
    delegate,
  );

  const walletClient = createWalletRpcClient(credential);
  const transactionRequest = buildWalletTransactionRequest(transaction) as Parameters<
    typeof walletClient.sendTransaction
  >[0];
  return walletClient.sendTransaction(transactionRequest);
}

async function sendWalletCalls(
  contents: WebContents,
  credential: PolymarketWalletCredential,
  params: unknown,
  delegate: BrowserProviderPromptDelegate,
): Promise<{ id: string }> {
  const origin = getRequestOrigin(contents);
  const input = parseWalletSendCallsParams(params);
  assertTransactionAccountAuthorized(origin, credential, input.from);
  await requestTransactionApproval(
    contents,
    credential,
    'wallet_sendCalls',
    input,
    undefined,
    delegate,
  );

  callBundlesById.set(input.id, {
    version: input.version,
    id: input.id,
    chainId: input.chainId,
    status: 100,
    atomic: false,
  });
  void processWalletCallBundle(credential, input);
  return { id: input.id };
}

async function processWalletCallBundle(
  credential: PolymarketWalletCredential,
  input: WalletSendCallsParams,
): Promise<void> {
  const receipts: WalletCallReceipt[] = [];
  try {
    const walletClient = createWalletRpcClient(credential);
    for (const call of input.calls) {
      const transactionRequest = buildWalletCallTransactionRequest(call) as Parameters<
        typeof walletClient.sendTransaction
      >[0];
      const hash = await walletClient.sendTransaction(transactionRequest);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      receipts.push(receiptToWalletCallReceipt(receipt));
      callBundlesById.set(input.id, {
        version: input.version,
        id: input.id,
        chainId: input.chainId,
        status: receipts.every((item) => item.status === '0x1') ? 100 : 600,
        atomic: false,
        receipts: [...receipts],
      });
    }

    callBundlesById.set(input.id, {
      version: input.version,
      id: input.id,
      chainId: input.chainId,
      status: receipts.every((item) => item.status === '0x1') ? 200 : 600,
      atomic: false,
      receipts,
    });
  } catch {
    callBundlesById.set(input.id, {
      version: input.version,
      id: input.id,
      chainId: input.chainId,
      status: receipts.length ? 600 : 400,
      atomic: false,
      receipts: receipts.length ? receipts : undefined,
    });
  }
}

function getWalletCallsStatus(params: unknown): WalletCallBundleStatus {
  const [id] = normalizeParams(params);
  if (typeof id !== 'string' || !id.trim()) {
    throw rpcError(-32602, 'Invalid wallet_getCallsStatus parameters');
  }
  const status = callBundlesById.get(id.trim());
  if (!status) throw rpcError(5730, 'This bundle id is unknown');
  return status;
}

function showWalletCallsStatus(params: unknown): null {
  const [id] = normalizeParams(params);
  if (typeof id !== 'string' || !callBundlesById.has(id.trim())) {
    throw rpcError(5730, 'This bundle id is unknown');
  }
  return null;
}

function getWalletCapabilities(
  credential: PolymarketWalletCredential,
  origin: string,
  params: unknown,
): Record<string, Record<string, unknown>> {
  const [address, chains] = normalizeParams(params);
  if (typeof address !== 'string' || !isAddress(address)) {
    throw rpcError(-32602, 'Invalid wallet_getCapabilities address');
  }
  assertTransactionAccountAuthorized(origin, credential, address as Address);
  const chainIds = Array.isArray(chains) && chains.length ? chains : [getPolygonChainIdHex()];
  const supportsPolygon = chainIds.some(
    (chainId) => typeof chainId === 'string' && chainId.toLowerCase() === getPolygonChainIdHex(),
  );
  if (!supportsPolygon) return {};
  return {
    [getPolygonChainIdHex()]: {
      atomic: { status: 'unsupported' },
    },
  };
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
    case 'wallet_getCapabilities':
      return getWalletCapabilities(credential, origin, request.params);
    case 'wallet_sendCalls':
      return sendWalletCalls(contents, credential, request.params, delegate);
    case 'wallet_getCallsStatus':
      return getWalletCallsStatus(request.params);
    case 'wallet_showCallsStatus':
      return showWalletCallsStatus(request.params);
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
      return sendEthTransaction(contents, credential, request.params, delegate);
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
