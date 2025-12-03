# 🎵 Revel – Quick MVP Testing

Revel is a React Native app for hosting party playlists powered by Spotify and AI song recommendations.

## 🚀 Try the MVP (Android)

[Download APK](https://expo.dev/accounts/lszefner/projects/revel/builds/5b146eb5-b41d-4245-bbdd-6ac4b907910f)

**How to Test:**

1. Get an Android phone with Spotify Premium.
2. Install the APK above.
3. Open the Spotify app, start playing any track, then leave it running in the background.
4. Open Revel, log in with your Spotify account, and try out the playlist features!

**Troubleshooting:**  
If playback controls don't work, double-check that the Spotify app is open and an active session is playing.

---

## ⚡ Local Setup (Optional)

```bash
git clone <repository-url>
cd revel
npm install
cp env.example .env   # Add your Supabase + Spotify config here
npx expo run:android
npm start
```

---

## ✨ Key Features

- Host a party playlist (Spotify Premium required).
- Guests join via QR code.
- Real-time updates.
- AI-powered song suggestions.

---

_Made for parties. MVP only. DM @lszefner for help._
