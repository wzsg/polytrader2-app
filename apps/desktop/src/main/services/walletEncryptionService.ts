import electron from 'electron';
import {
  AesWalletKeyMaterialSecurityService,
  ElectronWalletKeyMaterialSecurityService,
  type WalletKeyMaterialSecurityService,
} from '@polytrader/polymarket-wallet';

type WalletEncryptionMethod = 'keychain' | 'dpapi' | 'aes-256-gcm';

class WalletEncryptionService implements WalletKeyMaterialSecurityService {
  private _store: WalletKeyMaterialSecurityService | null = null;

  public configure(method: WalletEncryptionMethod, password?: string): void {
    if (method === 'aes-256-gcm') {
      this._store = new AesWalletKeyMaterialSecurityService(password);
      return;
    }
    this._assertSystemMethodSupported(method);
    const { safeStorage } = electron;
    this._store = new ElectronWalletKeyMaterialSecurityService({
      isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
      encryptString: (value) => safeStorage.encryptString(value),
      decryptString: (encrypted) => safeStorage.decryptString(encrypted),
    });
  }

  public verifySystemMethod(method: Exclude<WalletEncryptionMethod, 'aes-256-gcm'>): void {
    this.configure(method);
    const probe = `polytrader2-encryption-probe-${crypto.randomUUID()}`;
    const encrypted = this.encryptWalletKeyMaterial(probe);
    if (this.decryptWalletKeyMaterial(encrypted) !== probe) {
      throw new Error('System secure storage verification failed');
    }
  }

  public encryptWalletKeyMaterial(value: string, password?: string): string {
    return this._requireStore().encryptWalletKeyMaterial(value, password);
  }

  public decryptWalletKeyMaterial(value: string, password?: string): string {
    return this._requireStore().decryptWalletKeyMaterial(value, password);
  }

  private _assertSystemMethodSupported(
    method: Exclude<WalletEncryptionMethod, 'aes-256-gcm'>,
  ): void {
    if (method === 'keychain' && process.platform === 'darwin') return;
    if (method === 'dpapi' && process.platform === 'win32') return;
    throw new Error('The selected system encryption method is not supported on this platform');
  }

  private _requireStore(): WalletKeyMaterialSecurityService {
    if (!this._store) throw new Error('Wallet encryption has not been configured');
    return this._store;
  }
}

const walletEncryptionService = new WalletEncryptionService();

export { walletEncryptionService };
export type { WalletEncryptionMethod };
