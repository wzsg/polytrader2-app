import type { PolymarketBridgeSupportedAsset } from '@polytrader/shared';

const STORAGE_KEY_PREFIX = 'polytrader2.bridgeAssetSelection';

type BridgeAssetSelectionScope = 'deposit' | 'withdraw';

interface BridgeAssetSelection {
  chainId: string;
  tokenAddress: string;
}

function buildStorageKey(scope: BridgeAssetSelectionScope, walletId: string): string {
  return `${STORAGE_KEY_PREFIX}.${scope}.${walletId}`;
}

function isBridgeAssetSelection(input: unknown): input is BridgeAssetSelection {
  if (!input || typeof input !== 'object') return false;
  const record = input as Record<string, unknown>;
  return typeof record.chainId === 'string' && typeof record.tokenAddress === 'string';
}

function readBridgeAssetSelection(
  scope: BridgeAssetSelectionScope,
  walletId: string,
): BridgeAssetSelection | null {
  try {
    const rawValue = window.localStorage.getItem(buildStorageKey(scope, walletId));
    if (!rawValue) return null;
    const parsed = JSON.parse(rawValue) as unknown;
    return isBridgeAssetSelection(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeBridgeAssetSelection(
  scope: BridgeAssetSelectionScope,
  walletId: string,
  selection: BridgeAssetSelection,
): void {
  try {
    window.localStorage.setItem(buildStorageKey(scope, walletId), JSON.stringify(selection));
  } catch {
    // Selection memory is a convenience only; blocked storage should not interrupt bridge flows.
  }
}

function resolveBridgeAssetSelection(
  scope: BridgeAssetSelectionScope,
  walletId: string,
  assets: PolymarketBridgeSupportedAsset[],
): BridgeAssetSelection {
  const remembered = readBridgeAssetSelection(scope, walletId);
  const rememberedAsset = remembered
    ? assets.find(
        (asset) =>
          asset.chainId === remembered.chainId && asset.token.address === remembered.tokenAddress,
      )
    : null;

  if (remembered && rememberedAsset) return remembered;

  const first = assets[0];
  const fallback = {
    chainId: first?.chainId ?? '',
    tokenAddress: first?.token.address ?? '',
  };

  if (fallback.chainId && fallback.tokenAddress) {
    writeBridgeAssetSelection(scope, walletId, fallback);
  }

  return fallback;
}

export type { BridgeAssetSelection, BridgeAssetSelectionScope };
export { resolveBridgeAssetSelection, writeBridgeAssetSelection };
