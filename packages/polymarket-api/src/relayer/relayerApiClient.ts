import { encodeFunctionData, erc20Abi, erc1155Abi, maxUint256, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { POLYTRADER_RELAYER_API_BASE_URL } from '@polytrader/shared';
import type { PolymarketWalletCredentials } from '../account/index.js';
import type {
  DepositWalletCall,
  NormalizedRelayerCredentials,
  PolymarketRelayerApprovalInput,
  PolymarketRelayerMergeInput,
  PolymarketRelayerRedeemInput,
  PolymarketRelayerSplitInput,
  PolymarketRelayerSubmitResult,
  PolymarketRelayerTransactionResult,
  PolymarketRelayerTransferPusdInput,
  RelayerDeployedResult,
  RelayerNonceResult,
} from './types.js';

const DEFAULT_CHAIN_ID = 137;
const DEFAULT_DEPOSIT_WALLET_DEADLINE_SECONDS = 10 * 60;
const DEFAULT_TRANSACTION_POLL_ATTEMPTS = 30;
const DEFAULT_TRANSACTION_POLL_INTERVAL_MS = 2000;
const DEFAULT_DEPLOYED_POLL_ATTEMPTS = 30;
const DEFAULT_DEPLOYED_POLL_INTERVAL_MS = 2000;
const RELAYER_TRANSACTION_READY_STATES = new Set([
  'STATE_EXECUTED',
  'STATE_MINED',
  'STATE_CONFIRMED',
]);
const RELAYER_TRANSACTION_FAILED_STATES = new Set(['STATE_FAILED', 'STATE_INVALID']);
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
const DEFAULT_PARTITION = [1, 2] as const;

// Official Polymarket contract address source: https://docs.polymarket.com/resources/contracts
const POLYMARKET_CONTRACTS = {
  pusd: '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB',
  ctf: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
  ctfExchange: '0xE111180000d2663C0091e4f400237545B87B996B',
  negRiskCtfExchange: '0xe2222d279d744050d28e00520010520000310F59',
  negRiskAdapter: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
  ctfCollateralAdapter: '0xAdA100Db00Ca00073811820692005400218FcE1f',
  negRiskCtfCollateralAdapter: '0xadA2005600Dec949baf300f4C6120000bDB6eAab',
} as const satisfies Record<string, Address>;

const POLYMARKET_ERC20_APPROVAL_SPENDERS = [
  POLYMARKET_CONTRACTS.ctf,
  POLYMARKET_CONTRACTS.ctfExchange,
  POLYMARKET_CONTRACTS.negRiskCtfExchange,
  POLYMARKET_CONTRACTS.negRiskAdapter,
  POLYMARKET_CONTRACTS.ctfCollateralAdapter,
  POLYMARKET_CONTRACTS.negRiskCtfCollateralAdapter,
] as const;

const POLYMARKET_CTF_APPROVAL_OPERATORS = [
  POLYMARKET_CONTRACTS.ctfExchange,
  POLYMARKET_CONTRACTS.negRiskCtfExchange,
  POLYMARKET_CONTRACTS.negRiskAdapter,
  POLYMARKET_CONTRACTS.ctfCollateralAdapter,
  POLYMARKET_CONTRACTS.negRiskCtfCollateralAdapter,
] as const;

const collateralAdapterAbi = [
  {
    inputs: [
      { name: 'collateralToken', type: 'address' },
      { name: 'parentCollectionId', type: 'bytes32' },
      { name: 'conditionId', type: 'bytes32' },
      { name: 'partition', type: 'uint256[]' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'splitPosition',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'collateralToken', type: 'address' },
      { name: 'parentCollectionId', type: 'bytes32' },
      { name: 'conditionId', type: 'bytes32' },
      { name: 'partition', type: 'uint256[]' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'mergePositions',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'collateralToken', type: 'address' },
      { name: 'parentCollectionId', type: 'bytes32' },
      { name: 'conditionId', type: 'bytes32' },
      { name: 'indexSets', type: 'uint256[]' },
    ],
    name: 'redeemPositions',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const DEPOSIT_WALLET_TYPES = {
  Call: [
    { name: 'target', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'data', type: 'bytes' },
  ],
  Batch: [
    { name: 'wallet', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'calls', type: 'Call[]' },
  ],
} as const;

class PolymarketRelayerApiClient {
  private readonly _account: ReturnType<typeof privateKeyToAccount>;
  private readonly _credentials: NormalizedRelayerCredentials;

  public constructor(credentials: PolymarketWalletCredentials) {
    this._credentials = this.normalizeCredentials(credentials);
    this._account = privateKeyToAccount(this._credentials.privateKey);
  }

  public async getNonce(): Promise<string> {
    const search = new URLSearchParams({ address: this._account.address, type: 'WALLET' });
    const result = await this.getJson<RelayerNonceResult>(`/v1/nonce?${search.toString()}`);
    return result.nonce;
  }

  public async deploy(): Promise<PolymarketRelayerSubmitResult> {
    const result = await this.postJson<PolymarketRelayerSubmitResult>('/v1/deploy', {
      from: this._account.address,
    });
    const readyResult = await this.waitForTransactionReady(result);
    await this.waitForDepositWalletDeployed();
    return readyResult;
  }

  public async getDeployed(): Promise<boolean> {
    const search = new URLSearchParams({
      address: this._credentials.depositWalletAddress,
      type: 'WALLET',
    });
    const result = await this.getJson<RelayerDeployedResult>(`/v1/deployed?${search.toString()}`);
    return result.deployed;
  }

  public async getTransaction(
    transactionID: string,
  ): Promise<PolymarketRelayerTransactionResult[]> {
    const search = new URLSearchParams({ id: transactionID });
    return this.getJson<PolymarketRelayerTransactionResult[]>(
      `/v1/transaction?${search.toString()}`,
    );
  }

  public approval(input: PolymarketRelayerApprovalInput): Promise<PolymarketRelayerSubmitResult> {
    return this.executeSignedBatch('/v1/approval', input, buildApproveCalls(input.amount), {
      amount: input.amount,
    });
  }

  public split(input: PolymarketRelayerSplitInput): Promise<PolymarketRelayerSubmitResult> {
    return this.executeSignedBatch(
      '/v1/split',
      input,
      [
        buildCtfAmountCall('splitPosition', {
          conditionId: input.conditionId,
          amount: input.amount,
          negRisk: input.negRisk,
        }),
      ],
      {
        condition_id: input.conditionId,
        amount: input.amount,
        neg_risk: input.negRisk,
      },
    );
  }

  public merge(input: PolymarketRelayerMergeInput): Promise<PolymarketRelayerSubmitResult> {
    return this.executeSignedBatch(
      '/v1/merge',
      input,
      [
        buildCtfAmountCall('mergePositions', {
          conditionId: input.conditionId,
          amount: input.amount,
          negRisk: input.negRisk,
        }),
      ],
      {
        condition_id: input.conditionId,
        amount: input.amount,
        neg_risk: input.negRisk,
      },
    );
  }

  public redeem(input: PolymarketRelayerRedeemInput): Promise<PolymarketRelayerSubmitResult> {
    const indexSets = input.indexSets ?? [1, 2];
    return this.executeSignedBatch(
      '/v1/redeem',
      input,
      [
        call(
          adapterAddress(input.negRisk),
          encodeFunctionData({
            abi: collateralAdapterAbi,
            functionName: 'redeemPositions',
            args: [
              POLYMARKET_CONTRACTS.pusd,
              ZERO_BYTES32,
              input.conditionId,
              indexSets.map(BigInt),
            ],
          }),
        ),
      ],
      {
        condition_id: input.conditionId,
        index_sets: indexSets,
        neg_risk: input.negRisk,
      },
    );
  }

  public transferPusd(
    input: PolymarketRelayerTransferPusdInput,
  ): Promise<PolymarketRelayerSubmitResult> {
    return this.executeSignedBatch(
      '/v1/transfer-pusd',
      input,
      [
        call(
          POLYMARKET_CONTRACTS.pusd,
          encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transfer',
            args: [input.to, BigInt(input.amount)],
          }),
        ),
      ],
      {
        to: input.to,
        amount: input.amount,
      },
    );
  }

  private async executeSignedBatch(
    path: string,
    input: { nonce: string; deadline?: string },
    calls: DepositWalletCall[],
    body: Record<string, unknown>,
  ): Promise<PolymarketRelayerSubmitResult> {
    const deadline = input.deadline || depositWalletDeadline();
    const signature = await this.signBatch(input.nonce, deadline, calls);
    return this.postJson(path, {
      from: this._account.address,
      depositWallet: this._credentials.depositWalletAddress,
      nonce: input.nonce,
      deadline,
      signature,
      ...body,
    });
  }

  private signBatch(nonce: string, deadline: string, calls: DepositWalletCall[]): Promise<Hex> {
    return this._account.signTypedData({
      domain: {
        name: 'DepositWallet',
        version: '1',
        chainId: this._credentials.chainId,
        verifyingContract: this._credentials.depositWalletAddress,
      },
      types: DEPOSIT_WALLET_TYPES,
      primaryType: 'Batch',
      message: {
        wallet: this._credentials.depositWalletAddress,
        nonce: BigInt(nonce),
        deadline: BigInt(deadline),
        calls: calls.map((item) => ({
          target: item.target,
          value: BigInt(item.value),
          data: item.data,
        })),
      },
    });
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this._credentials.relayerApiBaseUrl}${path}`);
    return this.readJsonResponse<T>(response);
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this._credentials.relayerApiBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.readJsonResponse<T>(response);
  }

  private async readJsonResponse<T>(response: Response): Promise<T> {
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`Polymarket relayer API request failed: HTTP ${response.status} ${body}`);
    }
    return JSON.parse(body) as T;
  }

  private async waitForTransactionReady(
    result: PolymarketRelayerSubmitResult,
  ): Promise<PolymarketRelayerSubmitResult> {
    if (!result.transactionID || RELAYER_TRANSACTION_READY_STATES.has(result.state)) return result;
    for (let attempt = 0; attempt < DEFAULT_TRANSACTION_POLL_ATTEMPTS; attempt++) {
      await this.sleep(DEFAULT_TRANSACTION_POLL_INTERVAL_MS);
      const transactions = await this.getTransaction(result.transactionID);
      const transaction = transactions[0];
      if (!transaction) continue;
      if (RELAYER_TRANSACTION_READY_STATES.has(transaction.state)) {
        return {
          ...result,
          state: transaction.state,
          transactionHash: transaction.transactionHash ?? result.transactionHash,
        };
      }
      if (RELAYER_TRANSACTION_FAILED_STATES.has(transaction.state)) {
        throw new Error(`Polymarket relayer transaction ${result.transactionID} failed`);
      }
    }
    throw new Error(`Polymarket relayer transaction ${result.transactionID} did not become ready`);
  }

  private async waitForDepositWalletDeployed(): Promise<void> {
    for (let attempt = 0; attempt < DEFAULT_DEPLOYED_POLL_ATTEMPTS; attempt++) {
      if (await this.getDeployed()) return;
      await this.sleep(DEFAULT_DEPLOYED_POLL_INTERVAL_MS);
    }
    throw new Error(
      `Polymarket deposit wallet ${this._credentials.depositWalletAddress} did not become deployed`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private normalizeCredentials(
    credentials: PolymarketWalletCredentials,
  ): NormalizedRelayerCredentials {
    const chainId = Number.isFinite(credentials.chainId)
      ? Number(credentials.chainId)
      : DEFAULT_CHAIN_ID;
    if (chainId !== DEFAULT_CHAIN_ID) {
      throw new Error('Only Polygon mainnet chainId 137 is supported');
    }

    return {
      privateKey: normalizePrivateKey(credentials.privateKey),
      depositWalletAddress: normalizeAddress(
        credentials.depositWalletAddress,
        'depositWalletAddress',
      ),
      chainId,
      relayerApiBaseUrl: trimTrailingSlash(
        credentials.relayerApiBaseUrl?.trim() || POLYTRADER_RELAYER_API_BASE_URL,
      ),
    };
  }
}

function buildApproveCalls(amount?: string): DepositWalletCall[] {
  const value = amount === undefined ? maxUint256 : BigInt(amount);
  return [
    ...POLYMARKET_ERC20_APPROVAL_SPENDERS.map((spender) =>
      call(
        POLYMARKET_CONTRACTS.pusd,
        encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [spender, value],
        }),
      ),
    ),
    ...POLYMARKET_CTF_APPROVAL_OPERATORS.map((operator) =>
      call(
        POLYMARKET_CONTRACTS.ctf,
        encodeFunctionData({
          abi: erc1155Abi,
          functionName: 'setApprovalForAll',
          args: [operator, true],
        }),
      ),
    ),
  ];
}

function buildCtfAmountCall(
  functionName: 'splitPosition' | 'mergePositions',
  params: { conditionId: Hex; amount: string; negRisk: boolean },
): DepositWalletCall {
  return call(
    adapterAddress(params.negRisk),
    encodeFunctionData({
      abi: collateralAdapterAbi,
      functionName,
      args: [
        POLYMARKET_CONTRACTS.pusd,
        ZERO_BYTES32,
        params.conditionId,
        DEFAULT_PARTITION.map(BigInt),
        BigInt(params.amount),
      ],
    }),
  );
}

function call(target: Address, data: Hex): DepositWalletCall {
  return { target, value: '0', data };
}

function adapterAddress(negRisk: boolean): Address {
  return negRisk
    ? POLYMARKET_CONTRACTS.negRiskCtfCollateralAdapter
    : POLYMARKET_CONTRACTS.ctfCollateralAdapter;
}

function depositWalletDeadline(now = Date.now()): string {
  return Math.floor(now / 1000 + DEFAULT_DEPOSIT_WALLET_DEADLINE_SECONDS).toString();
}

function normalizePrivateKey(privateKey: string): Hex {
  const trimmed = privateKey.trim();
  if (!trimmed) throw new Error('Private key is required');
  return (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as Hex;
}

function normalizeAddress(value: string, name: string): Address {
  const trimmed = value.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    throw new Error(`${name} must be an EVM address`);
  }
  return trimmed as Address;
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export { PolymarketRelayerApiClient };
