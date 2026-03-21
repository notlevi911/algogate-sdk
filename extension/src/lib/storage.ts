export interface ExtensionSettings {
  geminiModel: string;
  network: string;
  walletAddress: string;
  walletProvider: string;
  walletConnected: boolean;
  walletInitialized: boolean;
  x402Enabled: boolean;
  connectedWalletAddress: string;
  lastDetectedPageType: string;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
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

export async function getSettings(): Promise<ExtensionSettings> {
  const settings = (await chrome.storage.sync.get(DEFAULT_SETTINGS)) as Partial<ExtensionSettings>;
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function setSettings(partial: Partial<ExtensionSettings> | Record<string, unknown>) {
  await chrome.storage.sync.set(partial);
}
