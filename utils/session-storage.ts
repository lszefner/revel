import * as SecureStore from "expo-secure-store";

const REFRESH_TOKEN_KEY = "host_refresh_token";
const ACTIVE_SESSION_KEY = "active_session_code";

/**
 * Store host refresh token securely
 */
export async function storeRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

/**
 * Get stored refresh token
 */
export async function getRefreshToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

/**
 * Clear refresh token
 */
export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

/**
 * Store active session code (the ONE session that stays alive)
 */
export async function storeActiveSession(code: string): Promise<void> {
  console.log("💾 Storing active session:", code);
  await SecureStore.setItemAsync(ACTIVE_SESSION_KEY, code);
}

/**
 * Get active session code
 */
export async function getActiveSession(): Promise<string | null> {
  const code = await SecureStore.getItemAsync(ACTIVE_SESSION_KEY);
  console.log("📖 Retrieved active session:", code || "none");
  return code;
}

/**
 * Clear active session (when host ends the session)
 */
export async function clearActiveSession(): Promise<void> {
  console.log("🗑️ Clearing active session");
  await SecureStore.deleteItemAsync(ACTIVE_SESSION_KEY);
}

/**
 * Clear all stored data (for testing/logout)
 */
export async function clearAllSessionData(): Promise<void> {
  console.log("🧹 Clearing all session data");
  await clearRefreshToken();
  await clearActiveSession();
}
