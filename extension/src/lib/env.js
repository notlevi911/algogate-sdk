let cachedConfig = null;
export async function getEnvConfig() {
    if (cachedConfig) {
        return cachedConfig;
    }
    try {
        const response = await fetch(chrome.runtime.getURL(".env"));
        if (!response.ok) {
            cachedConfig = emptyConfig();
            return cachedConfig;
        }
        const text = await response.text();
        cachedConfig = parseEnv(text);
        return cachedConfig;
    }
    catch {
        cachedConfig = emptyConfig();
        return cachedConfig;
    }
}
function parseEnv(text) {
    const lines = text.split(/\r?\n/);
    const values = {};
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }
        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex <= 0) {
            continue;
        }
        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim();
        values[key] = value;
    }
    return {
        GEMINI_API_KEY: values.GEMINI_API_KEY || "",
        GEMINI_MODEL: values.GEMINI_MODEL || ""
    };
}
function emptyConfig() {
    return {
        GEMINI_API_KEY: "",
        GEMINI_MODEL: ""
    };
}
