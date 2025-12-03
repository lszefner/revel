/**
 * Spotify OAuth Configuration
 *
 * IMPORTANT: Replace these values with your actual Spotify app credentials
 * Get them from: https://developer.spotify.com/dashboard
 */

export const SPOTIFY_CONFIG = {
  // Get this from Spotify Dashboard > Your App > Client ID
  clientId: "YOUR_SPOTIFY_CLIENT_ID_HERE",

  // Redirect URI must match what you set in Spotify Dashboard
  // For Expo: revel://auth (matches your app scheme)
  redirectUri: "revel://auth",

  // Scopes required for Web Playback SDK and playlist management
  scopes: [
    "user-read-private",
    "user-read-email",
    "playlist-modify-public",
    "playlist-modify-private",
    "user-modify-playback-state",
    "user-read-playback-state",
    "user-read-currently-playing",
    "user-read-recently-played",
    "streaming",
  ],

  // Spotify API endpoints
  endpoints: {
    auth: "https://accounts.spotify.com/authorize",
    token: "https://accounts.spotify.com/api/token",
    api: "https://api.spotify.com/v1",
  },
};
