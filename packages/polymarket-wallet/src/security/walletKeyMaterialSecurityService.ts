interface WalletKeyMaterialSecurityService {
  encryptWalletKeyMaterial(walletKeyMaterial: string, password?: string): string;
  decryptWalletKeyMaterial(storedWalletKeyMaterial: string, password?: string): string;
}

export type { WalletKeyMaterialSecurityService };
