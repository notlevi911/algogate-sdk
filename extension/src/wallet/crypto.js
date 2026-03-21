const PBKDF2_ITERATIONS = 250000;
export async function encryptJson(payload, password) {
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveAesKey(password, salt, ["encrypt"]);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, plaintext);
    return {
        version: 1,
        iterations: PBKDF2_ITERATIONS,
        salt: bytesToBase64(salt),
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(new Uint8Array(ciphertext))
    };
}
export async function decryptJson(record, password) {
    const salt = base64ToBytes(record.salt);
    const iv = base64ToBytes(record.iv);
    const ciphertext = base64ToBytes(record.ciphertext);
    const key = await deriveAesKey(password, salt, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext));
}
async function deriveAesKey(password, salt, usages) {
    const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({
        name: "PBKDF2",
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256"
    }, keyMaterial, {
        name: "AES-GCM",
        length: 256
    }, false, usages);
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
function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}
