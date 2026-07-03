import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import type { WalletKeyMaterialSecurityService } from './walletKeyMaterialSecurityService.js';

const WALLET_KEY_MATERIAL_STORAGE_PREFIX = 'aes-gcm:v1:';
const AES_GCM_IV_BYTES = 12;
const AES_GCM_KEY_BYTES = 32;

class AesWalletKeyMaterialSecurityService implements WalletKeyMaterialSecurityService {
  public encryptWalletKeyMaterial(walletKeyMaterial: string, password?: string): string {
    const key = this._deriveEncryptionKey(password);
    const iv = randomBytes(AES_GCM_IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(walletKeyMaterial, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${WALLET_KEY_MATERIAL_STORAGE_PREFIX}${[
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':')}`;
  }

  public decryptWalletKeyMaterial(storedWalletKeyMaterial: string, password?: string): string {
    const key = this._deriveEncryptionKey(password);
    const payload = this._parseStoredWalletKeyMaterial(storedWalletKeyMaterial);

    try {
      const decipher = createDecipheriv('aes-256-gcm', key, payload.iv);
      decipher.setAuthTag(payload.authTag);
      return Buffer.concat([decipher.update(payload.encrypted), decipher.final()]).toString('utf8');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to decrypt account key material: ${message}`, { cause: err });
    }
  }

  private _deriveEncryptionKey(password?: string): Buffer {
    if (!password?.trim()) {
      throw new Error('Password is required for the AES key material encryption service');
    }

    return createHash('sha256').update(password, 'utf8').digest().subarray(0, AES_GCM_KEY_BYTES);
  }

  private _parseStoredWalletKeyMaterial(storedWalletKeyMaterial: string): {
    iv: Buffer;
    authTag: Buffer;
    encrypted: Buffer;
  } {
    if (!storedWalletKeyMaterial.startsWith(WALLET_KEY_MATERIAL_STORAGE_PREFIX)) {
      throw new Error('Account key material uses an unsupported AES-GCM encryption format');
    }

    const parts = storedWalletKeyMaterial
      .slice(WALLET_KEY_MATERIAL_STORAGE_PREFIX.length)
      .split(':');
    if (parts.length !== 3 || parts.some((part) => !part)) {
      throw new Error('Account key material AES-GCM encrypted data is incomplete');
    }

    return {
      iv: Buffer.from(parts[0], 'base64'),
      authTag: Buffer.from(parts[1], 'base64'),
      encrypted: Buffer.from(parts[2], 'base64'),
    };
  }
}

export { AesWalletKeyMaterialSecurityService };
