import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { SPOTIFY_CONFIG } from '@/config/spotify';

const TOKEN_STORAGE_KEY = 'spotify_access_token';
const REFRESH_TOKEN_STORAGE_KEY = 'spotify_refresh_token';
const EXPIRES_AT_KEY = 'spotify_token_expires_at';

export interface SpotifyTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: number;
}

/**
 * Generate a code verifier and challenge for PKCE flow
 */
async function generatePKCE() {
  // Generate a random code verifier (43-128 characters, URL-safe)
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  
  // Convert bytes array to base64url string
  // Create a random string from bytes
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let codeVerifier = '';
  
  // Use random bytes to create a URL-safe random string
  for (let i = 0; i < 43; i++) {
    codeVerifier += chars[randomBytes[i % randomBytes.length] % chars.length];
  }
  
  // Generate code challenge by hashing the verifier
  const codeChallenge = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64URL }
  );

  return { codeVerifier, codeChallenge };
}

/**
 * Initiate Spotify OAuth flow using PKCE
 */
export async function initiateSpotifyAuth(): Promise<SpotifyTokenResponse | null> {
  try {
    const { codeVerifier, codeChallenge } = await generatePKCE();

    const authUrl = new URL(SPOTIFY_CONFIG.endpoints.auth);
    authUrl.searchParams.append('client_id', SPOTIFY_CONFIG.clientId);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', SPOTIFY_CONFIG.redirectUri);
    authUrl.searchParams.append('scope', SPOTIFY_CONFIG.scopes.join(' '));
    authUrl.searchParams.append('code_challenge_method', 'S256');
    authUrl.searchParams.append('code_challenge', codeChallenge);

    const result = await AuthSession.startAsync({
      authUrl: authUrl.toString(),
      returnUrl: SPOTIFY_CONFIG.redirectUri,
    });

    if (result.type === 'success' && result.params.code) {
      return await exchangeCodeForToken(result.params.code, codeVerifier);
    }

    return null;
  } catch (error) {
    console.error('Spotify auth error:', error);
    return null;
  }
}

/**
 * Exchange authorization code for access token
 * 
 * IMPORTANT: For production, you should use a backend server to exchange the code.
 * The client secret should NEVER be in your mobile app.
 * 
 * For development/testing, Spotify allows PKCE flow without client secret,
 * but you'll need to set up a backend for production.
 */
async function exchangeCodeForToken(
  code: string,
  codeVerifier: string
): Promise<SpotifyTokenResponse | null> {
  try {
    // TODO: Replace this with a call to your backend API endpoint
    // Example: const response = await fetch('YOUR_BACKEND_URL/api/spotify/token', { ... });
    
    // For now, trying direct call (may work in development with PKCE)
    const response = await fetch(SPOTIFY_CONFIG.endpoints.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_CONFIG.redirectUri,
        client_id: SPOTIFY_CONFIG.clientId,
        code_verifier: codeVerifier,
      }).toString(),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    const data = await response.json();
    const expiresAt = Date.now() + data.expires_in * 1000;

    const tokenResponse: SpotifyTokenResponse = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      expiresAt,
    };

    // Store tokens securely
    await storeTokens(tokenResponse);

    return tokenResponse;
  } catch (error) {
    console.error('Token exchange error:', error);
    return null;
  }
}

/**
 * Store tokens securely
 */
async function storeTokens(tokens: SpotifyTokenResponse): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, tokens.accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, tokens.refreshToken);
  await SecureStore.setItemAsync(EXPIRES_AT_KEY, tokens.expiresAt.toString());
}

/**
 * Get stored access token
 */
export async function getStoredAccessToken(): Promise<string | null> {
  try {
    const expiresAt = await SecureStore.getItemAsync(EXPIRES_AT_KEY);
    if (expiresAt && Date.now() >= parseInt(expiresAt, 10)) {
      // Token expired, try to refresh
      return await refreshAccessToken();
    }
    return await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
  } catch (error) {
    console.error('Error getting stored token:', error);
    return null;
  }
}

/**
 * Refresh access token using refresh token
 * 
 * IMPORTANT: For production, use a backend server for token refresh.
 */
async function refreshAccessToken(): Promise<string | null> {
  try {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_STORAGE_KEY);
    if (!refreshToken) return null;

    // TODO: Replace with backend API call
    // Example: const response = await fetch('YOUR_BACKEND_URL/api/spotify/refresh', { ... });
    
    const response = await fetch(SPOTIFY_CONFIG.endpoints.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: SPOTIFY_CONFIG.clientId,
      }).toString(),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const expiresAt = Date.now() + data.expires_in * 1000;

    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, data.access_token);
    await SecureStore.setItemAsync(EXPIRES_AT_KEY, expiresAt.toString());

    if (data.refresh_token) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, data.refresh_token);
    }

    return data.access_token;
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

/**
 * Clear stored tokens (logout)
 */
export async function clearStoredTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY);
  await SecureStore.deleteItemAsync(EXPIRES_AT_KEY);
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getStoredAccessToken();
  return token !== null;
}

