const WALLET_VAULT_KEY = "embeddedWalletVault";
const WALLET_META_KEY = "embeddedWalletMeta";

import type { EncryptedRecord } from "./crypto.js";

export interface WalletVaultMeta {
  address: string;
  network: string;
  createdAt: string;
}

export async function getWalletVaultRecord(): Promise<{
  vault: EncryptedRecord | null;
  meta: WalletVaultMeta | null;
}> {
  const data = (await chrome.storage.local.get([WALLET_VAULT_KEY, WALLET_META_KEY])) as Record<
    string,
    unknown
  >;
  return {
    vault: (data[WALLET_VAULT_KEY] as EncryptedRecord) || null,
    meta: (data[WALLET_META_KEY] as WalletVaultMeta) || null
  };
}

export async function saveWalletVaultRecord(vault: EncryptedRecord, meta: WalletVaultMeta) {
  await chrome.storage.local.set({
    [WALLET_VAULT_KEY]: vault,
    [WALLET_META_KEY]: meta
  });
}

export async function clearWalletVaultRecord() {
  await chrome.storage.local.remove([WALLET_VAULT_KEY, WALLET_META_KEY]);
}
