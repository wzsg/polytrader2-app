import type { WalletKeyMaterialSecurityService } from './walletKeyMaterialSecurityService.js';

const WALLET_KEY_MATERIAL_STORAGE_PREFIX = 'safe:v1:';

interface ElectronSafeStorageProvider {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

class ElectronWalletKeyMaterialSecurityService implements WalletKeyMaterialSecurityService {
  private readonly _safeStorage: ElectronSafeStorageProvider;

  public constructor(safeStorage: ElectronSafeStorageProvider) {
    this._safeStorage = safeStorage;
  }

  public encryptWalletKeyMaterial(walletKeyMaterial: string, _password?: string): string {
    this._assertWalletKeyMaterialEncryptionAvailable();
    const encrypted = this._safeStorage.encryptString(walletKeyMaterial);
    return `${WALLET_KEY_MATERIAL_STORAGE_PREFIX}${encrypted.toString('base64')}`;
  }

  public decryptWalletKeyMaterial(storedWalletKeyMaterial: string, _password?: string): string {
    this._assertWalletKeyMaterialEncryptionAvailable();
    if (!storedWalletKeyMaterial.startsWith(WALLET_KEY_MATERIAL_STORAGE_PREFIX)) {
      throw new Error(
        'Account key material uses an unsupported encryption format. Clear development data and recreate the account',
      );
    }

    try {
      const encrypted = Buffer.from(
        storedWalletKeyMaterial.slice(WALLET_KEY_MATERIAL_STORAGE_PREFIX.length),
        'base64',
      );
      return this._safeStorage.decryptString(encrypted);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to decrypt account key material: ${message}`, { cause: err });
    }
  }

  private _assertWalletKeyMaterialEncryptionAvailable(): void {
    if (this._safeStorage.isEncryptionAvailable()) return;
    throw new Error(
      'System secure storage is unavailable, so account key material cannot be read or saved',
    );
  }
}

export { ElectronWalletKeyMaterialSecurityService };
export type { ElectronSafeStorageProvider };
