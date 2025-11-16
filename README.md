# 🎵 Revel

A React Native party playlist app that lets hosts create music sessions and guests join via QR code. Features AI-powered song recommendations and automatic queue management with Spotify integration.

## ✨ Features

- **Host Sessions**: Create and manage party playlists with Spotify Premium
- **Guest Participation**: Join sessions by scanning QR codes
- **Real-time Queue**: Live synchronized playlist updates across all devices
- **AI Recommendations**: Automatic song suggestions when queue runs low
- **Smart Ranking**: AI-powered algorithm that ranks songs based on musical vibe
- **Spotify Integration**: Seamless playback control and queue management
- **Persistent Sessions**: Sessions stay alive until host explicitly ends them
- **Auto-play**: First song automatically starts playing
- **Duplicate Prevention**: Smart duplicate detection prevents adding the same song twice

## 🛠️ Tech Stack

- **Frontend**: React Native (Expo) with TypeScript
- **Navigation**: Expo Router (file-based routing)
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Real-time**: Supabase Realtime subscriptions
- **Authentication**: Spotify OAuth 2.0 with PKCE
- **Music API**: Spotify Web API
- **QR Codes**: `react-native-qrcode-svg` for generation, `expo-camera` for scanning
- **Storage**: Expo Secure Store for sensitive data

## 📋 Prerequisites

- Node.js 18+ and npm
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`)
- Spotify Premium account
- Supabase account
- Expo account (for EAS builds)

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd revel
npm install
```

### 2. Environment Variables

Create a `.env` file in the root directory:

```bash
cp env.example .env
```

Fill in your credentials:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_SPOTIFY_CLIENT_ID=your_spotify_client_id
```

### 3. Supabase Setup

1. Create a new Supabase project
2. Run the database migrations (see `supabase/migrations/`)
3. Deploy Edge Functions:
   ```bash
   supabase functions deploy auth-login
   supabase functions deploy auth-callback
   supabase functions deploy auth-refresh
   supabase functions deploy create-session
   supabase functions deploy rank-queue
   supabase functions deploy get-recommendations
   ```
4. Set Edge Function secrets in Supabase Dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_REDIRECT_URI` (optional, has fallback)

### 4. Spotify Setup

1. Create a Spotify app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Add redirect URI: `https://your-project.supabase.co/functions/v1/auth-callback`
3. Copy Client ID and Client Secret
4. Add Client ID to `.env` file
5. Add Client Secret to Supabase Edge Function secrets

### 5. Run the App

```bash
# Start development server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Run on web
npm run web
```

## 🏗️ Building for Production

### EAS Build Setup

1. Login to EAS:

   ```bash
   eas login
   ```

2. Configure EAS:

   ```bash
   eas build:configure
   ```

3. Set environment variables in EAS Dashboard or via CLI:

   ```bash
   eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "your-url"
   eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-key"
   ```

4. Build for Android:

   ```bash
   eas build --platform android --profile preview
   ```

5. Build for iOS:
   ```bash
   eas build --platform ios --profile preview
   ```

## 📁 Project Structure

```
revel/
├── app/                    # Expo Router pages
│   ├── index.tsx          # Home screen (host/join)
│   ├── host/              # Host flow
│   │   ├── login.tsx      # Spotify OAuth
│   │   └── create-session.tsx
│   ├── guest/             # Guest flow
│   │   └── scan.tsx       # QR code scanner
│   └── session.tsx        # Main session screen
├── components/            # Reusable components
├── config/               # Configuration files
│   ├── supabase.ts       # Supabase client
│   └── spotify.ts        # Spotify config
├── utils/                # Utility functions
│   ├── spotify-session.ts
│   ├── spotify-player.ts
│   └── session-storage.ts
├── supabase/
│   ├── functions/        # Edge Functions
│   │   ├── auth-login/
│   │   ├── auth-callback/
│   │   ├── auth-refresh/
│   │   ├── create-session/
│   │   ├── rank-queue/
│   │   └── get-recommendations/
│   └── migrations/       # Database migrations
└── assets/               # Images, icons, etc.
```

## 🎯 Key Features Explained

### Session Management

- Sessions persist until host explicitly ends them
- Auto-redirect to active session on app launch
- Token refresh prevents session expiration

### Queue System

- Real-time synchronization via Supabase Realtime
- AI ranking algorithm sorts songs by musical similarity
- Dynamic weights adjust based on queue variance
- Played songs automatically removed from queue

### Recommendations

- Triggers when last song has 20 seconds remaining
- Uses dataset-based similarity matching
- Prevents duplicates and respects user control

### Spotify Integration

- OAuth 2.0 with PKCE for secure authentication
- Web Playback SDK for playback control
- Queue management via Spotify Web API
- Auto-play for first song

## 🔐 Security

- Sensitive tokens stored in Expo Secure Store
- OAuth 2.0 with PKCE for Spotify authentication
- Row Level Security (RLS) enabled on Supabase tables
- Environment variables for API keys (never commit secrets)

## 📱 Supported Platforms

- ✅ iOS (via Expo)
- ✅ Android (via Expo)

## 🐛 Troubleshooting

### Build Errors

- **Icon compilation error**: Ensure all icon files are valid PNGs (1024x1024px)
- **Environment variables**: Check EAS secrets are set correctly
- **Spotify auth**: Verify redirect URI matches Spotify Dashboard

### Runtime Issues

- **No active device**: Ensure Spotify app is open and Premium account is active
- **Session not found**: Check Supabase connection and session code
- **Queue not updating**: Verify Realtime subscriptions are active

## 📝 Environment Variables

### Required for Frontend

- `EXPO_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` - Spotify app client ID

### Required for Edge Functions (set in Supabase Dashboard)

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `SPOTIFY_CLIENT_ID` - Spotify app client ID
- `SPOTIFY_CLIENT_SECRET` - Spotify app client secret
- `SPOTIFY_REDIRECT_URI` - Spotify redirect URI (optional)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is private and proprietary.

## 🙏 Acknowledgments

- Spotify Web API for music playback
- Supabase for backend infrastructure
- Expo for React Native tooling

---

Made with ❤️ for party playlists
