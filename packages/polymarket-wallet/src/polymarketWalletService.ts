import { toHex } from 'viem';
import { HDKey, generatePrivateKey, hdKeyToAccount, privateKeyToAccount } from 'viem/accounts';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english';
import type {
  PolymarketWalletFields,
  PolymarketWalletPositionSummary,
  PolymarketWalletRecord,
  PolymarketWalletRepository,
} from '@polytrader/repository-contract';
import {
  POLYMARKET_CLOB_BASE_URL,
  POLYMARKET_WALLET_LIMIT,
  type BalanceAllowance,
  type PolymarketAccountCredentialDerivationResult,
  type PolymarketWalletCreateInput,
  type PolymarketWalletDerivedInput,
  type PolymarketWalletImportInput,
  type PolymarketWalletKeyMaterialReveal,
  type PolymarketWalletSummary,
  type PolymarketWalletUpdateInput,
  type PolymarketWalletWalletKeyMaterialType,
} from '@polytrader/shared';
import type { ApplicationEventBus } from '@polytrader/event-bus';
import { ElectronWalletKeyMaterialSecurityService } from './security/electronWalletKeyMaterialSecurityService.js';
import type { WalletKeyMaterialSecurityService } from './security/walletKeyMaterialSecurityService.js';
import type {
  PolymarketAccountCredentialDeriver,
  PolymarketDepositWalletDeployer,
  PolymarketDepositWalletDeploymentResult,
  PolymarketWalletInitializationWorkflowInput,
  PolymarketWalletInitializationResult,
  PolymarketWalletInitializationWorkflowScheduler,
  PolymarketWalletCredential,
  PolymarketWalletService,
  PolymarketWalletServiceOptions,
  PolymarketStrategyWalletSummary,
} from './types.js';

type PolymarketWalletStorageInputFields = Omit<
  PolymarketWalletCredential,
  'id' | 'createdAt' | 'updatedAt'
>;
type WalletKeyMaterialStorageFields = Pick<
  PolymarketWalletStorageInputFields,
  'walletKeyMaterialType' | 'parentWalletId' | 'derivationPath' | 'walletAddress'
> & {
  walletKeyMaterial: string;
  privateKey: `0x${string}`;
};

const DEFAULT_CHAIN_ID = 137;
const DEFAULT_SIGNATURE_TYPE = 3;
const DEFAULT_DERIVATION_PATH = "m/44'/60'/0'/0/0";

class PolymarketWalletServiceImpl implements PolymarketWalletService {
  private readonly _secretStore: WalletKeyMaterialSecurityService;
  private readonly _accountCredentialDeriver: PolymarketAccountCredentialDeriver;
  private readonly _depositWalletDeployer: PolymarketDepositWalletDeployer;
  private readonly _initializationWorkflowScheduler: PolymarketWalletInitializationWorkflowScheduler;
  private readonly _repository: PolymarketWalletRepository;
  private readonly _eventBus: ApplicationEventBus | null;

  public constructor(options: PolymarketWalletServiceOptions) {
    this._secretStore = new ElectronWalletKeyMaterialSecurityService(options.safeStorage);
    this._accountCredentialDeriver = options.accountCredentialDeriver;
    this._depositWalletDeployer = options.depositWalletDeployer;
    this._initializationWorkflowScheduler = options.initializationWorkflowScheduler;
    this._repository = options.repository;
    this._eventBus = options.eventBus ?? null;
  }

  public async listPolymarketWallets(): Promise<PolymarketWalletSummary[]> {
    return (await this._repository.list()).map((row) => this._mapSummary(row));
  }

  public async listConfiguredPolymarketWalletCredentials(): Promise<PolymarketWalletCredential[]> {
    return (await this._repository.listConfigured()).map((row) => this._mapCredential(row));
  }

  public async listStrategyWallets(): Promise<PolymarketStrategyWalletSummary[]> {
    return (await this.listPolymarketWallets()).map(
      ({
        id,
        name,
        creationType,
        walletKeyMaterialType,
        parentWalletId,
        derivationPath,
        walletAddress,
        credentialsConfigured,
        depositWalletAddress,
        signatureType,
        chainId,
        clobHost,
        initializationStatus,
        initializationError,
        keyMaterialBackedUp,
        isDefault,
      }) => ({
        id,
        name,
        creationType,
        walletKeyMaterialType,
        parentWalletId,
        derivationPath,
        walletAddress,
        credentialsConfigured,
        depositWalletAddress,
        signatureType,
        chainId,
        clobHost,
        initializationStatus,
        initializationError,
        keyMaterialBackedUp,
        isDefault,
      }),
    );
  }

  public async createPolymarketWallet(
    input: PolymarketWalletCreateInput,
  ): Promise<PolymarketWalletSummary> {
    await this._assertAccountLimitNotReached();
    const name = input.name.trim();
    if (!name) throw new Error('Account name is required');

    const walletKeyMaterialFields = this._generatedWalletKeyMaterialStorageFields(
      input.walletKeyMaterialType,
    );

    const wallet = await this._insertPolymarketWallet({
      name,
      creationType: 'created',
      ...this._stripPrivateKey(walletKeyMaterialFields),
      apiKey: '',
      secret: '',
      passphrase: '',
      depositWalletAddress: '',
      relayerApiKey: '',
      signatureType: DEFAULT_SIGNATURE_TYPE,
      chainId: DEFAULT_CHAIN_ID,
      clobHost: POLYMARKET_CLOB_BASE_URL,
      initializationStatus: 'pending',
      initializationError: '',
      keyMaterialBackedUp: false,
      isDefault: input.isDefault === true,
    });
    await this._enqueueInitialization({ walletId: wallet.id, nonce: input.nonce });
    return wallet;
  }

  public async importPolymarketWallet(
    input: PolymarketWalletImportInput,
  ): Promise<PolymarketWalletSummary> {
    await this._assertAccountLimitNotReached();
    return await this._insertPolymarketWallet(await this._normalizeImportInput(input));
  }

  public async createDerivedPolymarketWallet(
    input: PolymarketWalletDerivedInput,
  ): Promise<PolymarketWalletSummary> {
    await this._assertAccountLimitNotReached();
    const wallet = await this._insertPolymarketWallet(await this._normalizeDerivedInput(input));
    await this._enqueueInitialization({ walletId: wallet.id, nonce: input.nonce });
    return wallet;
  }

  public async initializePolymarketWallet(
    id: string,
    nonce?: number,
  ): Promise<PolymarketWalletInitializationResult> {
    const current = await this._getPolymarketWalletRecord(id);
    if (current.initializationStatus === 'ready' && this._rawCredentialsConfigured(current)) {
      return {
        wallet: this._mapSummary(current),
        depositWalletDeployment: null,
      };
    }

    try {
      let wallet = current;
      let accountCredentials: PolymarketAccountCredentialDerivationResult;
      if (this._rawCredentialsConfigured(wallet)) {
        accountCredentials = this._accountCredentialsFromRecord(wallet);
      } else {
        wallet = await this._updateInitialization(id, {
          initializationStatus: 'deriving_credentials',
          initializationError: '',
        });
        accountCredentials =
          await this._accountCredentialDeriver.derivePolymarketAccountCredentials({
            privateKey: this._resolvePrivateKey(wallet),
            nonce,
            chainId: wallet.chainId,
            clobHost: wallet.clobHost,
          });
        wallet = await this._updateInitializationCredentials(id, accountCredentials);
      }

      wallet = await this._updateInitialization(id, {
        initializationStatus: 'deploying_deposit_wallet',
        initializationError: '',
      });
      const depositWalletDeployment = await this._deployDepositWallet(
        this._resolvePrivateKey(wallet),
        accountCredentials,
      );
      const readyWallet = await this._updateInitialization(id, {
        initializationStatus: 'ready',
        initializationError: '',
      });
      return {
        wallet: this._mapSummary(readyWallet),
        depositWalletDeployment,
      };
    } catch (error) {
      await this._updateInitialization(id, {
        initializationStatus: 'failed',
        initializationError: this._errorMessage(error),
      });
      throw error;
    }
  }

  public async retryPolymarketWalletInitialization(id: string): Promise<PolymarketWalletSummary> {
    const wallet = await this._getPolymarketWalletRecord(id);
    if (wallet.initializationStatus !== 'failed') {
      throw new Error('Only failed wallet initialization can be retried');
    }

    const pendingWallet = await this._updateInitialization(id, {
      initializationStatus: 'pending',
      initializationError: '',
    });
    await this._enqueueInitialization({ walletId: id });
    return this._mapSummary(pendingWallet);
  }

  public async updatePolymarketWallet(
    input: PolymarketWalletUpdateInput,
  ): Promise<PolymarketWalletSummary> {
    if (!input.id) throw new Error('Account ID is required');

    const current = await this._getPolymarketWalletRecord(input.id);
    const previousWallet = this._mapSummary(current);
    const normalized = this._normalizeUpdateInput(input, current);
    const wallet = this._mapSummary(await this._repository.update(input.id, normalized));
    this._publishWalletUpdated(wallet, previousWallet);
    return wallet;
  }

  public async markPolymarketWalletKeyMaterialBackedUp(
    id: string,
  ): Promise<PolymarketWalletSummary> {
    const previousWallet = this._mapSummary(await this._getPolymarketWalletRecord(id));
    const wallet = this._mapSummary(await this._repository.markKeyMaterialBackedUp(id));
    this._publishWalletUpdated(wallet, previousWallet);
    return wallet;
  }

  public async getPolymarketWalletCredential(id: string): Promise<PolymarketWalletCredential> {
    return this._mapCredential(await this._getPolymarketWalletRecord(id));
  }

  public async getPolymarketWalletSummary(id: string): Promise<PolymarketWalletSummary> {
    return this._mapSummary(await this._getPolymarketWalletRecord(id));
  }

  public updatePolymarketWalletBalance(
    id: string,
    balance: BalanceAllowance | null,
  ): Promise<boolean> {
    return this._repository.updateBalance(id, balance);
  }

  public updatePolymarketWalletPositionSummary(
    id: string,
    summary: PolymarketWalletPositionSummary,
  ): Promise<boolean> {
    return this._repository.updatePositionSummary(id, summary);
  }

  public async getPolymarketWalletKeyMaterial(
    id: string,
  ): Promise<PolymarketWalletKeyMaterialReveal> {
    const row = await this._getPolymarketWalletRecord(id);
    if (row.walletKeyMaterialType === 'mnemonic_seed') {
      return {
        walletId: row.id,
        type: 'mnemonic',
        value: this._resolveMnemonic(row),
      };
    }

    return {
      walletId: row.id,
      type: 'private_key',
      value: this._resolvePrivateKey(row),
    };
  }

  public async getDefaultPolymarketWalletCredential(): Promise<PolymarketWalletCredential | null> {
    const row = await this._repository.getDefault();
    return row ? this._mapCredential(row) : null;
  }

  public async getDefaultConfiguredPolymarketWalletCredential(): Promise<PolymarketWalletCredential | null> {
    const row = await this._repository.getDefaultConfigured();
    return row ? this._mapCredential(row) : null;
  }

  public assertPolymarketWalletCredentialsConfigured(credential: PolymarketWalletCredential): void {
    if (this._credentialsConfigured(credential)) return;
    throw new Error(
      'This account is missing API Key, Secret, Passphrase, and Deposit Wallet Address, so it cannot be used for trading',
    );
  }

  public async getDefaultPolymarketWalletSummary(): Promise<PolymarketWalletSummary | null> {
    const row = await this._repository.getDefault();
    return row ? this._mapSummary(row) : null;
  }

  public async setDefaultPolymarketWallet(id: string): Promise<PolymarketWalletSummary> {
    const previousDefaultWalletId = (await this._repository.getDefault())?.id ?? null;
    const wallet = this._mapSummary(await this._repository.setDefault(id));
    this._eventBus?.publish('polymarket-wallet:default-changed', {
      wallet,
      previousDefaultWalletId,
      at: this._now(),
    });
    return wallet;
  }

  public async deletePolymarketWallet(id: string): Promise<void> {
    const target = await this._getPolymarketWalletRecord(id);
    if (
      target.walletKeyMaterialType === 'mnemonic_seed' &&
      (await this._repository.list()).some((account) => account.parentWalletId === id)
    ) {
      throw new Error('This HD wallet has derived accounts and cannot be deleted');
    }

    await this._repository.delete(id);
    this._eventBus?.publish('polymarket-wallet:deleted', {
      wallet: this._mapSummary(target),
      at: this._now(),
    });
  }

  private _normalizePrivateKey(privateKey: string): `0x${string}` {
    const trimmed = privateKey.trim();
    if (!trimmed) throw new Error('Private key is required');
    return (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as `0x${string}`;
  }

  private _normalizeMnemonic(mnemonic: string | undefined): string {
    const normalized = mnemonic?.trim().replace(/\s+/g, ' ') || '';
    if (!normalized) throw new Error('Mnemonic is required');
    if (!validateMnemonic(normalized, englishWordlist))
      throw new Error('Mnemonic format is invalid');
    return normalized;
  }

  private _normalizeMnemonicSeed(seed: string): `0x${string}` {
    const normalized = seed.trim();
    if (!/^0x[0-9a-fA-F]{128}$/.test(normalized))
      throw new Error('Mnemonic seed format is invalid');
    return normalized as `0x${string}`;
  }

  private _normalizeDerivationPath(
    derivationPath: string | null | undefined,
  ): `m/44'/60'/${string}` {
    const normalized = derivationPath?.trim() || DEFAULT_DERIVATION_PATH;
    if (!/^m\/44'\/60'\/\d+'\/\d+\/\d+$/.test(normalized)) {
      throw new Error('Mnemonic derivation path format is invalid');
    }
    return normalized as `m/44'/60'/${string}`;
  }

  private _mask(value: string): string {
    if (!value) return '';
    if (value.length <= 8) return `${value.slice(0, 2)}***`;
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }

  private _walletAddressFromPrivateKey(privateKey: string): string {
    return privateKeyToAccount(this._normalizePrivateKey(privateKey)).address;
  }

  private _privateKeyWalletKeyMaterialStorageFields(
    privateKeyInput: string,
  ): WalletKeyMaterialStorageFields {
    const privateKey = this._normalizePrivateKey(privateKeyInput);
    return {
      walletKeyMaterial: this._secretStore.encryptWalletKeyMaterial(privateKey),
      walletKeyMaterialType: 'private_key',
      parentWalletId: null,
      derivationPath: null,
      walletAddress: this._walletAddressFromPrivateKey(privateKey),
      privateKey,
    };
  }

  private _mnemonicSeedWalletKeyMaterialStorageFields(
    mnemonicInput: string | undefined,
  ): WalletKeyMaterialStorageFields {
    const mnemonic = this._normalizeMnemonic(mnemonicInput);
    const derivationPath = this._normalizeDerivationPath(DEFAULT_DERIVATION_PATH);
    const privateKey = this._privateKeyFromMnemonic(mnemonic, derivationPath);

    return {
      walletKeyMaterial: this._secretStore.encryptWalletKeyMaterial(mnemonic),
      walletKeyMaterialType: 'mnemonic_seed',
      parentWalletId: null,
      derivationPath,
      walletAddress: this._walletAddressFromPrivateKey(privateKey),
      privateKey,
    };
  }

  private _derivedWalletKeyMaterialStorageFields(
    parent: PolymarketWalletRecord,
    derivationPath: string,
  ): WalletKeyMaterialStorageFields {
    const mnemonic = this._normalizeMnemonic(
      this._secretStore.decryptWalletKeyMaterial(parent.walletKeyMaterial),
    );
    const normalizedDerivationPath = this._normalizeDerivationPath(derivationPath);
    const privateKey = this._privateKeyFromMnemonic(mnemonic, normalizedDerivationPath);

    return {
      walletKeyMaterial: parent.walletKeyMaterial,
      walletKeyMaterialType: 'derived_wallet',
      parentWalletId: parent.id,
      derivationPath: normalizedDerivationPath,
      walletAddress: this._walletAddressFromPrivateKey(privateKey),
      privateKey,
    };
  }

  private _generatedWalletKeyMaterialStorageFields(
    walletKeyMaterialType: PolymarketWalletWalletKeyMaterialType | undefined,
  ): WalletKeyMaterialStorageFields {
    if (walletKeyMaterialType === 'mnemonic_seed') {
      return this._mnemonicSeedWalletKeyMaterialStorageFields(generateMnemonic(englishWordlist));
    }
    if (walletKeyMaterialType === 'derived_wallet') {
      throw new Error('Derived wallets must be created from an HD wallet');
    }
    return this._privateKeyWalletKeyMaterialStorageFields(generatePrivateKey());
  }

  private _mnemonicToSeedHex(mnemonic: string): `0x${string}` {
    return toHex(mnemonicToSeedSync(mnemonic)) as `0x${string}`;
  }

  private _privateKeyFromMnemonic(
    mnemonic: string,
    derivationPath: string | null | undefined,
  ): `0x${string}` {
    return this._privateKeyFromMnemonicSeed(this._mnemonicToSeedHex(mnemonic), derivationPath);
  }

  private _privateKeyFromMnemonicSeed(
    seed: string,
    derivationPath: string | null | undefined,
  ): `0x${string}` {
    const normalizedSeed = this._normalizeMnemonicSeed(seed);
    const hdKey = HDKey.fromMasterSeed(Buffer.from(normalizedSeed.slice(2), 'hex'));
    const account = hdKeyToAccount(hdKey, { path: this._normalizeDerivationPath(derivationPath) });
    const privateKey = account.getHdKey().privateKey;
    if (!privateKey) throw new Error('Failed to derive a private key from the mnemonic seed');
    return toHex(privateKey) as `0x${string}`;
  }

  private _derivationPathIndex(derivationPath: string | null | undefined): number {
    const normalized = this._normalizeDerivationPath(derivationPath);
    const index = Number(normalized.slice(normalized.lastIndexOf('/') + 1));
    if (!Number.isInteger(index) || index < 0) throw new Error('Derivation path index is invalid');
    return index;
  }

  private _derivationPathPrefix(derivationPath: string | null | undefined): string {
    const normalized = this._normalizeDerivationPath(derivationPath);
    return normalized.slice(0, normalized.lastIndexOf('/') + 1);
  }

  private async _nextDerivedWalletDerivationPath(parent: PolymarketWalletRecord): Promise<string> {
    const prefix = this._derivationPathPrefix(parent.derivationPath);
    const parentIndex = this._derivationPathIndex(parent.derivationPath);
    const childIndexes = (await this._repository.list())
      .filter((account) => account.parentWalletId === parent.id)
      .map((account) => account.derivationPath)
      .filter((derivationPath): derivationPath is string => Boolean(derivationPath))
      .filter((derivationPath) => derivationPath.startsWith(prefix))
      .map((derivationPath) => this._derivationPathIndex(derivationPath));
    const maxIndex = Math.max(parentIndex, ...childIndexes);
    return this._normalizeDerivationPath(`${prefix}${maxIndex + 1}`);
  }

  private _walletKeyMaterialStorageFields(
    input: PolymarketWalletImportInput,
  ): WalletKeyMaterialStorageFields {
    if (input.walletKeyMaterialType === 'mnemonic_seed') {
      return this._mnemonicSeedWalletKeyMaterialStorageFields(input.mnemonic);
    }
    if (input.walletKeyMaterialType === 'derived_wallet') {
      throw new Error('Derived wallets must be created from an HD wallet');
    }
    return this._privateKeyWalletKeyMaterialStorageFields(input.privateKey || '');
  }

  private _resolvePrivateKey(row: PolymarketWalletRecord): `0x${string}` {
    const walletKeyMaterial = this._secretStore.decryptWalletKeyMaterial(row.walletKeyMaterial);
    if (
      row.walletKeyMaterialType === 'derived_wallet' &&
      (!row.parentWalletId || !row.derivationPath)
    ) {
      throw new Error('Derived wallet is missing its parent account or derivation path');
    }
    if (
      row.walletKeyMaterialType === 'mnemonic_seed' ||
      row.walletKeyMaterialType === 'derived_wallet'
    ) {
      return this._privateKeyFromMnemonic(
        this._normalizeMnemonic(walletKeyMaterial),
        row.derivationPath,
      );
    }
    return this._normalizePrivateKey(walletKeyMaterial);
  }

  private _resolveMnemonic(row: PolymarketWalletRecord): string {
    return this._normalizeMnemonic(
      this._secretStore.decryptWalletKeyMaterial(row.walletKeyMaterial),
    );
  }

  private _credentialsConfigured(
    credential: Pick<
      PolymarketWalletCredential,
      'apiKey' | 'secret' | 'passphrase' | 'depositWalletAddress' | 'initializationStatus'
    >,
  ): boolean {
    return Boolean(
      credential.initializationStatus === 'ready' &&
      credential.apiKey.trim() &&
      credential.secret.trim() &&
      credential.passphrase.trim() &&
      credential.depositWalletAddress.trim(),
    );
  }

  private _assertCredentialsCompleteOrEmpty(
    credential: Pick<
      PolymarketWalletCredential,
      'apiKey' | 'secret' | 'passphrase' | 'depositWalletAddress'
    >,
  ): void {
    const values = [
      credential.apiKey.trim(),
      credential.secret.trim(),
      credential.passphrase.trim(),
      credential.depositWalletAddress.trim(),
    ];
    const hasAny = values.some(Boolean);
    const hasAll = values.every(Boolean);
    if (hasAny && !hasAll) {
      throw new Error(
        'API Key, Secret, Passphrase, and Deposit Wallet Address must be filled together or left blank together',
      );
    }
  }

  private _numberOrFallback(value: number | undefined, fallback: number): number {
    return Number.isFinite(value) ? Number(value) : fallback;
  }

  private _retainWhenBlank(value: string | undefined, current: string): string {
    const next = value?.trim();
    return next ? next : current;
  }

  private _mapCredential(row: PolymarketWalletRecord): PolymarketWalletCredential {
    return {
      id: row.id,
      name: row.name,
      creationType: row.creationType,
      walletKeyMaterialType: row.walletKeyMaterialType,
      parentWalletId: row.parentWalletId,
      derivationPath: row.derivationPath,
      privateKey: this._resolvePrivateKey(row),
      walletAddress: row.walletAddress,
      apiKey: row.apiKey,
      secret: row.secret,
      passphrase: row.passphrase,
      depositWalletAddress: row.depositWalletAddress,
      relayerApiKey: row.relayerApiKey,
      signatureType: row.signatureType,
      chainId: row.chainId,
      clobHost: row.clobHost,
      initializationStatus: row.initializationStatus,
      initializationError: row.initializationError,
      keyMaterialBackedUp: row.keyMaterialBackedUp,
      isDefault: row.isDefault,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private _mapSummary(row: PolymarketWalletRecord): PolymarketWalletSummary {
    return {
      id: row.id,
      name: row.name,
      creationType: row.creationType,
      walletKeyMaterialType: row.walletKeyMaterialType,
      parentWalletId: row.parentWalletId,
      derivationPath: row.derivationPath,
      walletAddress: row.walletAddress,
      credentialsConfigured: this._credentialsConfigured(row),
      apiKeyMasked: this._mask(row.apiKey),
      secretMasked: this._mask(row.secret),
      passphraseMasked: this._mask(row.passphrase),
      depositWalletAddress: row.depositWalletAddress,
      balance: row.balance,
      positionsTotalValue: row.positionsTotalValue,
      positionsInitialValue: row.positionsInitialValue,
      relayerApiKeyMasked: this._mask(row.relayerApiKey),
      signatureType: row.signatureType,
      chainId: row.chainId,
      clobHost: row.clobHost,
      initializationStatus: row.initializationStatus,
      initializationError: row.initializationError,
      keyMaterialBackedUp: row.keyMaterialBackedUp,
      isDefault: row.isDefault,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async _normalizeImportInput(
    input: PolymarketWalletImportInput,
  ): Promise<PolymarketWalletFields> {
    const name = input.name.trim();
    if (!name) throw new Error('Account name is required');

    const walletKeyMaterialFields = this._walletKeyMaterialStorageFields(input);
    const accountCredentials =
      await this._accountCredentialDeriver.derivePolymarketAccountCredentials({
        privateKey: walletKeyMaterialFields.privateKey,
        chainId: this._numberOrFallback(input.chainId, DEFAULT_CHAIN_ID),
        clobHost: input.clobHost?.trim() || POLYMARKET_CLOB_BASE_URL,
      });

    const apiKey = (input.apiKey || accountCredentials.apiKey).trim();
    const secret = (input.secret || accountCredentials.secret).trim();
    const passphrase = (input.passphrase || accountCredentials.passphrase).trim();
    const depositWalletAddress = (
      input.depositWalletAddress || accountCredentials.depositWalletAddress
    ).trim();
    const relayerApiKey = input.relayerApiKey?.trim() || '';
    if (!apiKey || !secret || !passphrase || !depositWalletAddress) {
      throw new Error('API Key, Secret, Passphrase, and Deposit Wallet Address are all required');
    }

    return {
      name,
      creationType: 'imported',
      ...this._stripPrivateKey(walletKeyMaterialFields),
      apiKey,
      secret,
      passphrase,
      depositWalletAddress,
      relayerApiKey,
      signatureType: this._numberOrFallback(input.signatureType, accountCredentials.signatureType),
      chainId: this._numberOrFallback(input.chainId, accountCredentials.chainId),
      clobHost: input.clobHost?.trim() || accountCredentials.clobHost,
      initializationStatus: 'ready',
      initializationError: '',
      keyMaterialBackedUp: true,
      isDefault: input.isDefault === true,
    };
  }

  private async _normalizeDerivedInput(
    input: PolymarketWalletDerivedInput,
  ): Promise<PolymarketWalletFields> {
    const name = input.name.trim();
    if (!name) throw new Error('Account name is required');

    const parentWalletId = input.parentWalletId.trim();
    if (!parentWalletId) throw new Error('Parent account is required');

    const parent = await this._getPolymarketWalletRecord(parentWalletId);
    if (parent.walletKeyMaterialType !== 'mnemonic_seed') {
      throw new Error('Only HD wallets can derive accounts');
    }

    const walletKeyMaterialFields = this._derivedWalletKeyMaterialStorageFields(
      parent,
      await this._nextDerivedWalletDerivationPath(parent),
    );
    return {
      name,
      creationType: 'created',
      ...this._stripPrivateKey(walletKeyMaterialFields),
      apiKey: '',
      secret: '',
      passphrase: '',
      depositWalletAddress: '',
      relayerApiKey: '',
      signatureType: parent.signatureType || DEFAULT_SIGNATURE_TYPE,
      chainId: parent.chainId || DEFAULT_CHAIN_ID,
      clobHost: parent.clobHost || POLYMARKET_CLOB_BASE_URL,
      initializationStatus: 'pending',
      initializationError: '',
      keyMaterialBackedUp: false,
      isDefault: input.isDefault === true,
    };
  }

  private _normalizeUpdateInput(
    input: PolymarketWalletUpdateInput,
    current: PolymarketWalletRecord,
  ): PolymarketWalletFields {
    const name = input.name == null ? current.name : input.name.trim();
    if (!name) throw new Error('Account name is required');

    const normalized = {
      name,
      creationType: current.creationType,
      walletKeyMaterial: current.walletKeyMaterial,
      walletKeyMaterialType: current.walletKeyMaterialType,
      parentWalletId: current.parentWalletId,
      derivationPath: current.derivationPath,
      walletAddress: current.walletAddress,
      apiKey: current.apiKey,
      secret: current.secret,
      passphrase: current.passphrase,
      depositWalletAddress: current.depositWalletAddress,
      relayerApiKey: this._retainWhenBlank(input.relayerApiKey, current.relayerApiKey),
      signatureType: current.signatureType,
      chainId: current.chainId,
      clobHost: current.clobHost,
      initializationStatus: current.initializationStatus,
      initializationError: current.initializationError,
      keyMaterialBackedUp: current.keyMaterialBackedUp,
      isDefault: input.isDefault == null ? current.isDefault : input.isDefault === true,
    };

    this._assertCredentialsCompleteOrEmpty(normalized);
    return normalized;
  }

  private async _insertPolymarketWallet(
    normalized: PolymarketWalletFields,
  ): Promise<PolymarketWalletSummary> {
    const wallet = this._mapSummary(await this._repository.insert(normalized));
    this._eventBus?.publish('polymarket-wallet:created', {
      wallet,
      at: this._now(),
    });
    return wallet;
  }

  private _publishWalletUpdated(
    wallet: PolymarketWalletSummary,
    previousWallet: PolymarketWalletSummary,
  ): void {
    this._eventBus?.publish('polymarket-wallet:updated', {
      wallet,
      previousWallet,
      at: this._now(),
    });
  }

  private async _enqueueInitialization(
    input: PolymarketWalletInitializationWorkflowInput,
  ): Promise<void> {
    try {
      await this._initializationWorkflowScheduler.enqueuePolymarketWalletInitialization(input);
    } catch (error) {
      await this._updateInitialization(input.walletId, {
        initializationStatus: 'failed',
        initializationError: this._errorMessage(error),
      });
      throw error;
    }
  }

  private async _updateInitialization(
    id: string,
    fields: {
      initializationStatus: PolymarketWalletRecord['initializationStatus'];
      initializationError?: string;
    },
  ): Promise<PolymarketWalletRecord> {
    const previousWallet = this._mapSummary(await this._getPolymarketWalletRecord(id));
    const record = await this._repository.updateInitialization(id, fields);
    this._publishWalletUpdated(this._mapSummary(record), previousWallet);
    return record;
  }

  private async _updateInitializationCredentials(
    id: string,
    accountCredentials: PolymarketAccountCredentialDerivationResult,
  ): Promise<PolymarketWalletRecord> {
    const previousWallet = this._mapSummary(await this._getPolymarketWalletRecord(id));
    const record = await this._repository.updateInitializationCredentials(id, {
      apiKey: accountCredentials.apiKey,
      secret: accountCredentials.secret,
      passphrase: accountCredentials.passphrase,
      depositWalletAddress: accountCredentials.depositWalletAddress,
      signatureType: accountCredentials.signatureType,
      chainId: accountCredentials.chainId,
      clobHost: accountCredentials.clobHost,
    });
    this._publishWalletUpdated(this._mapSummary(record), previousWallet);
    return record;
  }

  private _now(): string {
    return new Date().toISOString();
  }

  private async _assertAccountLimitNotReached(): Promise<void> {
    if ((await this._repository.list()).length < POLYMARKET_WALLET_LIMIT) return;
    throw new Error('Account limit reached. You can add up to 30 accounts.');
  }

  private _stripPrivateKey(
    fields: WalletKeyMaterialStorageFields,
  ): Pick<
    PolymarketWalletFields,
    | 'walletKeyMaterial'
    | 'walletKeyMaterialType'
    | 'parentWalletId'
    | 'derivationPath'
    | 'walletAddress'
  > {
    return {
      walletKeyMaterial: fields.walletKeyMaterial,
      walletKeyMaterialType: fields.walletKeyMaterialType,
      parentWalletId: fields.parentWalletId,
      derivationPath: fields.derivationPath,
      walletAddress: fields.walletAddress,
    };
  }

  private _rawCredentialsConfigured(
    credential: Pick<
      PolymarketWalletRecord,
      'apiKey' | 'secret' | 'passphrase' | 'depositWalletAddress'
    >,
  ): boolean {
    return Boolean(
      credential.apiKey.trim() &&
      credential.secret.trim() &&
      credential.passphrase.trim() &&
      credential.depositWalletAddress.trim(),
    );
  }

  private _accountCredentialsFromRecord(
    record: PolymarketWalletRecord,
  ): PolymarketAccountCredentialDerivationResult {
    return {
      walletAddress: record.walletAddress,
      apiKey: record.apiKey,
      secret: record.secret,
      passphrase: record.passphrase,
      depositWalletAddress: record.depositWalletAddress,
      signatureType: record.signatureType,
      chainId: record.chainId,
      clobHost: record.clobHost,
    };
  }

  private async _deployDepositWallet(
    privateKey: string,
    accountCredentials: PolymarketAccountCredentialDerivationResult,
  ): Promise<PolymarketDepositWalletDeploymentResult> {
    return await this._depositWalletDeployer.deployDepositWallet({
      privateKey,
      apiKey: accountCredentials.apiKey,
      secret: accountCredentials.secret,
      passphrase: accountCredentials.passphrase,
      depositWalletAddress: accountCredentials.depositWalletAddress,
      signatureType: accountCredentials.signatureType,
      chainId: accountCredentials.chainId,
      clobHost: accountCredentials.clobHost,
    });
  }

  private async _getPolymarketWalletRecord(id: string): Promise<PolymarketWalletRecord> {
    return this._repository.get(id);
  }

  private _errorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    if (typeof error === 'string' && error.trim()) return error.trim();
    return 'Unknown wallet initialization error';
  }
}

export { PolymarketWalletServiceImpl };
