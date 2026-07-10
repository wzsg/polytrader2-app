import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import type { WalletKeyMaterialSecurityService } from './walletKeyMaterialSecurityService.js';

const WALLET_KEY_MATERIAL_STORAGE_PREFIX = 'aes-gcm:v2:';
const AES_GCM_IV_BYTES = 12;
const AES_GCM_KEY_BYTES = 32;
const PASSWORD_SALT_BYTES = 16;

class AesWalletKeyMaterialSecurityService implements WalletKeyMaterialSecurityService {
  private readonly _password: string;

  public constructor(password?: string) {
    if (!password?.trim()) throw new Error('Password is required for AES encryption');
    this._password = password;
  }

  public encryptWalletKeyMaterial(walletKeyMaterial: string, password?: string): string {
    const salt = randomBytes(PASSWORD_SALT_BYTES);
    const key = this._deriveEncryptionKey(password || this._password, salt);
    const iv = randomBytes(AES_GCM_IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(walletKeyMaterial, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${WALLET_KEY_MATERIAL_STORAGE_PREFIX}${[
      salt.toString('base64'),
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':')}`;
  }

  public decryptWalletKeyMaterial(storedWalletKeyMaterial: string, password?: string): string {
    const payload = this._parseStoredWalletKeyMaterial(storedWalletKeyMaterial);
    const key = this._deriveEncryptionKey(password || this._password, payload.salt);

    try {
      const decipher = createDecipheriv('aes-256-gcm', key, payload.iv);
      decipher.setAuthTag(payload.authTag);
      return Buffer.concat([decipher.update(payload.encrypted), decipher.final()]).toString('utf8');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to decrypt account key material: ${message}`, { cause: err });
    }
  }

  private _deriveEncryptionKey(password: string | undefined, salt: Buffer): Buffer {
    if (!password?.trim()) {
      throw new Error('Password is required for the AES key material encryption service');
    }

    return scryptSync(password, salt, AES_GCM_KEY_BYTES);
  }

  private _parseStoredWalletKeyMaterial(storedWalletKeyMaterial: string): {
    iv: Buffer;
    salt: Buffer;
    authTag: Buffer;
    encrypted: Buffer;
  } {
    if (!storedWalletKeyMaterial.startsWith(WALLET_KEY_MATERIAL_STORAGE_PREFIX)) {
      throw new Error('Account key material uses an unsupported AES-GCM encryption format');
    }

    const parts = storedWalletKeyMaterial
      .slice(WALLET_KEY_MATERIAL_STORAGE_PREFIX.length)
      .split(':');
    if (parts.length !== 4 || parts.some((part) => !part)) {
      throw new Error('Account key material AES-GCM encrypted data is incomplete');
    }

    return {
      salt: Buffer.from(parts[0], 'base64'),
      iv: Buffer.from(parts[1], 'base64'),
      authTag: Buffer.from(parts[2], 'base64'),
      encrypted: Buffer.from(parts[3], 'base64'),
    };
  }
}

export { AesWalletKeyMaterialSecurityService };
