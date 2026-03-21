const WALLET_VAULT_KEY = "embeddedWalletVault";
const WALLET_META_KEY = "embeddedWalletMeta";
export async function getWalletVaultRecord() {
    const data = (await chrome.storage.local.get([WALLET_VAULT_KEY, WALLET_META_KEY]));
    return {
        vault: data[WALLET_VAULT_KEY] || null,
        meta: data[WALLET_META_KEY] || null
    };
}
export async function saveWalletVaultRecord(vault, meta) {
    await chrome.storage.local.set({
        [WALLET_VAULT_KEY]: vault,
        [WALLET_META_KEY]: meta
    });
}
export async function clearWalletVaultRecord() {
    await chrome.storage.local.remove([WALLET_VAULT_KEY, WALLET_META_KEY]);
}
