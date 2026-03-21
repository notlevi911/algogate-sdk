export const STANDARD_MNEMONIC_WORDS = 25;
export const DEFAULT_ALGORAND_NETWORK = "testnet";
export function createAlgorandWalletDraft() {
    const account = algosdk.generateAccount();
    const mnemonic = algosdk.secretKeyToMnemonic(account.sk);
    return serializeAccount(account, mnemonic);
}
export function importAlgorandWalletFromMnemonic(mnemonic) {
    const normalizedMnemonic = normalizeMnemonic(mnemonic);
    const account = algosdk.mnemonicToSecretKey(normalizedMnemonic);
    return serializeAccount(account, normalizedMnemonic);
}
export function normalizeMnemonic(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .join(" ");
}
export function mnemonicWords(mnemonic) {
    return normalizeMnemonic(mnemonic).split(" ").filter(Boolean);
}
function serializeAccount(account, mnemonic) {
    return {
        address: account.addr.toString(),
        mnemonic,
        secretKeyBase64: bytesToBase64(account.sk),
        network: DEFAULT_ALGORAND_NETWORK
    };
}
function bytesToBase64(bytes) {
    const chunkSize = 32768;
    let binary = "";
    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}
