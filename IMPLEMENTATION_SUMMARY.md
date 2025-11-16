# Implementation Summary

## Complete Spotify OAuth Flow with Supabase

This implementation provides a complete Spotify OAuth flow using Supabase Edge Functions, with support for both returning hosts (fast path) and new hosts.

## Architecture Overview

### Frontend Flow

1. **User taps "Host a Party"**

   - App checks for stored `refresh_token` in secure storage

2. **Path A: Returning Host (Fast Path)**

   - If `refresh_token` exists:
     - Call `auth-refresh` Edge Function
     - Get new `access_token` and `party_code`
     - Initialize Spotify Remote SDK
     - Navigate directly to session screen (no login UI)

3. **Path B: New Host (First-Time Path)**
   - If no `refresh_token`:
     - Call `create-session` Edge Function → get `party_code`
     - Call `auth-login` Edge Function → get Spotify auth URL
     - Open WebView with Spotify login
     - User logs in and authorizes
     - Spotify redirects to `auth-callback` Edge Function
     - Edge Function updates session in Supabase
     - Frontend listens for session update via Supabase Realtime
     - When `access_token` appears, initialize Spotify SDK
     - Navigate to session screen

### Backend (Supabase Edge Functions)

1. **`create-session`**

   - Generates unique `party_code` (format: A-123)
   - Creates session row in Supabase
   - Returns `party_code`

2. **`auth-login`**

   - Takes `party_code` as input
   - Creates Spotify authorization URL with `party_code` as `state` parameter
   - Returns authorization URL

3. **`auth-refresh`**

   - Takes `refresh_token` as input
   - Refreshes Spotify access token
   - Generates new `party_code`
   - Creates new session with tokens
   - Returns `party_code` and `access_token`

4. **`auth-callback`**
   - Handles Spotify OAuth callback
   - Extracts `code` and `state` (party_code) from URL
   - Exchanges code for tokens using Spotify API
   - Updates session row in Supabase with tokens
   - Returns success HTML page

## Key Features

✅ **Fast Path for Returning Hosts** - No login screen needed  
✅ **Secure Token Storage** - Uses `expo-secure-store`  
✅ **Real-time Updates** - Supabase Realtime for session updates  
✅ **Spotify SDK Integration** - `react-native-spotify-remote` for playback  
✅ **Unique Party Codes** - Format: A-123, B-456, etc.  
✅ **Automatic Token Refresh** - Handled by Edge Functions

## Files Structure

```
revel/
├── config/
│   ├── supabase.ts          # Supabase client config
│   └── spotify.ts            # Spotify config
├── utils/
│   ├── session-storage.ts    # Secure storage utilities
│   └── spotify-session.ts    # Session management & Spotify SDK
├── supabase/
│   ├── schema.sql            # Database schema
│   └── functions/
│       ├── create-session/   # Generate party_code
│       ├── auth-login/       # Get Spotify auth URL
│       ├── auth-refresh/     # Refresh token flow
│       └── auth-callback/    # Handle OAuth callback
└── app/
    └── host/
        └── login.tsx         # Main login screen with full flow
```

## Setup Required

1. **Supabase Project**

   - Create project
   - Run `schema.sql`
   - Deploy Edge Functions
   - Enable Realtime for `sessions` table

2. **Spotify App**

   - Create app in Spotify Dashboard
   - Add redirect URI: `https://YOUR_PROJECT.supabase.co/functions/v1/auth-callback`
   - Get Client ID and Secret

3. **Environment Variables**

   - Supabase URL and Anon Key
   - Spotify Client ID (in config file)
   - Spotify Client Secret (Edge Function secrets)

4. **Edge Function Secrets**
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_REDIRECT_URI` (optional, auto-generated)

## Next Steps

1. Follow `SUPABASE_SETUP.md` for detailed setup instructions
2. Configure your Supabase credentials in `config/supabase.ts`
3. Configure your Spotify Client ID in `config/spotify.ts`
4. Deploy Edge Functions
5. Test the flow!

## Notes

- The `react-native-spotify-remote` SDK requires native linking
- Make sure to enable Realtime in Supabase for session updates to work
- Edge Functions automatically have access to `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Party codes are unique and auto-generated
- Refresh tokens are stored securely for returning hosts
