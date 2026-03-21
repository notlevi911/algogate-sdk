export const DEFAULT_SETTINGS = {
    geminiModel: "gemini-2.5-flash",
    network: "testnet",
    walletAddress: "",
    walletProvider: "embedded",
    walletConnected: false,
    walletInitialized: false,
    x402Enabled: true,
    connectedWalletAddress: "",
    lastDetectedPageType: "generic"
};
export async function getSettings() {
    const settings = (await chrome.storage.sync.get(DEFAULT_SETTINGS));
    return { ...DEFAULT_SETTINGS, ...settings };
}
export async function setSettings(partial) {
    await chrome.storage.sync.set(partial);
}
