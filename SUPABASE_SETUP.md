# Supabase Setup Guide

## Step 1: Create Supabase Project

1. Go to https://supabase.com
2. Sign up or log in
3. Click **"New Project"**
4. Fill in:
   - **Name**: revel
   - **Database Password**: (choose a strong password)
   - **Region**: Choose closest to you
5. Click **"Create new project"**
6. Wait for project to be created (~2 minutes)

## Step 2: Get Your Supabase Credentials

1. Go to **Settings** → **API**
2. Copy:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (long string starting with `eyJ...`)

## Step 3: Set Up Database Schema

1. Go to **SQL Editor** in Supabase dashboard
2. Click **"New query"**
3. Copy and paste the contents of `supabase/schema.sql`
4. Click **"Run"**
5. Verify the `sessions` table was created in **Table Editor**

## Step 4: Set Up Edge Functions

### Install Supabase CLI

```bash
npm install -g supabase
```

### Login to Supabase

```bash
supabase login
```

### Link Your Project

```bash
cd c:\Users\User\Business\apps\revel
supabase link --project-ref YOUR_PROJECT_REF
```

(Get project ref from Supabase dashboard URL: `https://supabase.com/dashboard/project/YOUR_PROJECT_REF`)

### Deploy Edge Functions

```bash
# Deploy create-session
supabase functions deploy create-session

# Deploy auth-login
supabase functions deploy auth-login

# Deploy auth-refresh
supabase functions deploy auth-refresh

# Deploy auth-callback
supabase functions deploy auth-callback
```

## Step 5: Configure Edge Function Secrets

Set environment variables for each Edge Function:

```bash
# Spotify credentials
supabase secrets set SPOTIFY_CLIENT_ID=your_client_id
supabase secrets set SPOTIFY_CLIENT_SECRET=your_client_secret
supabase secrets set SPOTIFY_REDIRECT_URI=https://YOUR_PROJECT_REF.supabase.co/functions/v1/auth-callback

# Supabase credentials (automatically available, but verify)
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-set
```

## Step 6: Update Spotify Redirect URI

1. Go to https://developer.spotify.com/dashboard
2. Edit your app settings
3. Add redirect URI:
   ```
   https://YOUR_PROJECT_REF.supabase.co/functions/v1/auth-callback
   ```
4. Also keep: `revel://auth` (for mobile app)

## Step 7: Configure Your App

1. Open `config/supabase.ts`
2. Replace `YOUR_SUPABASE_URL_HERE` with your Project URL
3. Replace `YOUR_SUPABASE_ANON_KEY_HERE` with your anon key

Or set environment variables:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Step 8: Enable Realtime (Important!)

1. Go to **Database** → **Replication** in Supabase dashboard
2. Enable replication for the `sessions` table
3. This allows the app to listen for session updates in real-time

## Step 9: Test the Flow

1. Run your app: `npm start`
2. Tap "Host a Party"
3. First time: Should open Spotify login
4. After login: Should navigate to session screen
5. Second time: Should skip login (fast path)

## Troubleshooting

**Edge Functions not deploying:**

- Make sure Supabase CLI is installed and logged in
- Verify project is linked correctly
- Check function code for syntax errors

**Realtime not working:**

- Verify replication is enabled for `sessions` table
- Check Supabase dashboard → Replication settings

**Callback not working:**

- Verify redirect URI matches exactly in Spotify dashboard
- Check Edge Function logs in Supabase dashboard
- Ensure `auth-callback` function is deployed

**Session not updating:**

- Check Edge Function logs
- Verify Supabase service role key is set
- Check database permissions

## Files Created

- `config/supabase.ts` - Supabase client configuration
- `supabase/schema.sql` - Database schema
- `supabase/functions/create-session/` - Create session Edge Function
- `supabase/functions/auth-login/` - Get auth URL Edge Function
- `supabase/functions/auth-refresh/` - Refresh token Edge Function
- `supabase/functions/auth-callback/` - Handle Spotify callback Edge Function
- `utils/session-storage.ts` - Secure token storage utilities
- `utils/spotify-session.ts` - Session management utilities
