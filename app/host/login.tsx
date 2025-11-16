import { storeActiveSession, storeRefreshToken } from "@/utils/session-storage";
import {
  checkForActiveSession,
  createNewSession,
  getAuthUrl,
  getSession,
  initializeSpotifyPlayer,
  refreshSpotifyToken,
  SessionData,
  subscribeToSession,
  updateSessionTokens,
} from "@/utils/spotify-session";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// Close WebBrowser when unmounting
WebBrowser.maybeCompleteAuthSession();

export default function SpotifyLoginScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    checkForActiveSessionFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkForActiveSessionFlow = async () => {
    setIsChecking(true);
    try {
      const activeSession = await checkForActiveSession();

      if (activeSession) {
        console.log("🎉 Found active session, resuming...");
        await resumeActiveSession(
          activeSession.sessionCode,
          activeSession.refreshToken
        );
      } else {
        console.log("❌ No active session, showing login screen");
        setIsChecking(false);
      }
    } catch (error) {
      console.error("Error checking for active session:", error);
      setIsChecking(false);
    }
  };

  const resumeActiveSession = async (
    sessionCode: string,
    refreshToken: string
  ) => {
    try {
      console.log("🔄 Refreshing tokens for active session:", sessionCode);
      const tokenData = await refreshSpotifyToken(refreshToken);

      if (!tokenData) {
        console.log("❌ Token refresh failed");
        Alert.alert(
          "Session Expired",
          "Your session has expired. Please start a new one.",
          [{ text: "OK" }]
        );
        setIsChecking(false);
        return;
      }

      console.log("✅ Tokens refreshed");

      // Validate token
      const initialized = await initializeSpotifyPlayer(tokenData.access_token);

      if (!initialized) {
        console.error("❌ Token validation failed");
        Alert.alert(
          "Session Expired",
          "Unable to connect to Spotify. Please start a new session.",
          [{ text: "OK" }]
        );
        setIsChecking(false);
        return;
      }

      console.log("✅ Token validated");

      // Update the existing session with refreshed tokens
      const updated = await updateSessionTokens(
        sessionCode,
        tokenData.access_token,
        tokenData.refresh_token,
        tokenData.expires_at
      );

      if (!updated) {
        console.error("❌ Failed to update session");
        Alert.alert(
          "Error",
          "Failed to update session. Please start a new one.",
          [{ text: "OK" }]
        );
        setIsChecking(false);
        return;
      }

      // Store refreshed tokens
      await storeRefreshToken(tokenData.refresh_token);

      console.log("🎉 Resuming session:", sessionCode);

      // Navigate to existing session immediately (don't wait for queue clear)
      router.push({
        pathname: "/session",
        params: {
          sessionName: `Party ${sessionCode}`,
          role: "host",
          partyCode: sessionCode,
        },
      });
    } catch (error) {
      console.error("Error resuming active session:", error);
      Alert.alert(
        "Error",
        "Failed to resume session. Please start a new one.",
        [{ text: "OK" }]
      );
      setIsChecking(false);
    }
  };

  const handleLogin = async () => {
    setIsLoading(true);
    setStatusMessage("Creating session...");
    let partyCode: string | null = null;

    try {
      console.log("🚀 Starting host login flow...");

      // Step 1: Create session
      partyCode = await createNewSession();
      console.log("✅ Session created with code:", partyCode);

      if (!partyCode) {
        throw new Error("Failed to create session");
      }

      // Step 2: Get authorization URL
      setStatusMessage("Connecting to Spotify...");
      const authUrl = await getAuthUrl(partyCode);
      console.log("🔗 Auth URL retrieved:", authUrl ? "✅ Valid" : "❌ NULL");
      console.log("🔗 Full URL:", authUrl?.substring(0, 100) + "...");

      if (!authUrl) {
        throw new Error("Failed to get authorization URL");
      }

      // Step 3: Start listening for session updates BEFORE opening browser
      console.log("👂 Starting listener before opening browser");
      const updatePromise = waitForSessionUpdate(partyCode);

      // Step 4: Open browser with Spotify login
      setStatusMessage("Opening Spotify login...");
      console.log("🌐 Opening WebBrowser for auth");
      console.log("🌐 URL:", authUrl);
      console.log("🌐 Redirect scheme:", "revel://auth");

      // Add timeout for slow loading
      const browserPromise = WebBrowser.openAuthSessionAsync(
        authUrl,
        "revel://auth",
        {
          showInRecents: true,
        }
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          console.log("⏱️ Browser loading timeout - but continuing to wait");
          setStatusMessage(
            "Taking longer than expected...\nPlease wait or check your internet connection"
          );
        }, 10000); // Warning after 10 seconds, but don't reject
      });

      // Don't actually timeout, just show warning
      Promise.race([browserPromise, timeoutPromise]).catch(() => {
        // Timeout happened, but we still wait for browserPromise
      });

      const result = await browserPromise;

      console.log("🌐 WebBrowser result:", result.type);
      console.log("🌐 Full result:", JSON.stringify(result, null, 2));

      // Even if browser closes, keep waiting for session update
      if (result.type === "cancel" || result.type === "dismiss") {
        console.log("ℹ️ User dismissed browser, waiting for authorization");
        // User closed the browser, but might complete login in Spotify app
        setStatusMessage(
          "Waiting for authorization...\n(You can check your email and come back)"
        );
      } else {
        setStatusMessage("Completing login...");
      }

      // Wait for the session to be updated (works even if browser closed)
      console.log("⏳ Waiting for session update...");
      await updatePromise;
    } catch (error) {
      console.error("Login error:", error);

      // Show detailed error message
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Full error details:", errorMessage);

      // If user is still waiting for email code, show helpful message
      if (partyCode) {
        Alert.alert(
          "Login Taking Long?",
          "If you're checking your email for a confirmation code, you can complete the Spotify login and then return to the app.",
          [
            {
              text: "Retry",
              onPress: handleLogin,
            },
            {
              text: "Cancel",
              style: "cancel",
            },
          ]
        );
      } else {
        Alert.alert(
          "Error",
          `Failed to start login: ${errorMessage}\n\nCheck the console for details.`
        );
      }
    } finally {
      setIsLoading(false);
      setStatusMessage("");
    }
  };

  const waitForSessionUpdate = async (partyCode: string) => {
    console.log("👂 Waiting for session update for code:", partyCode);

    return new Promise<void>((resolve, reject) => {
      let unsubscribe: (() => void) | null = null;
      let hasResolved = false;
      let pollInterval: NodeJS.Timeout | null = null;

      // Fallback polling mechanism in case Realtime doesn't work
      const pollSession = async () => {
        if (hasResolved) return;

        console.log("🔍 Polling for session update...");
        const session = await getSession(partyCode);

        if (session?.host_access_token) {
          console.log("✅ Found token via polling!");
          handleSessionUpdate(session);
        }
      };

      // Start polling every 2 seconds as fallback
      pollInterval = setInterval(pollSession, 2000);

      // Increased timeout to 5 minutes for email verification
      const timeout = setTimeout(() => {
        if (!hasResolved) {
          console.error("⏱️ Timeout waiting for session update");
          if (unsubscribe) unsubscribe();
          if (pollInterval) clearInterval(pollInterval);
          reject(new Error("Login timeout - please try again"));
        }
      }, 300000); // 5 minutes

      const handleSessionUpdate = async (session: SessionData) => {
        if (hasResolved) return;

        if (session.host_access_token) {
          hasResolved = true;
          console.log("✅ Valid token received, proceeding...");
          clearTimeout(timeout);
          if (unsubscribe) unsubscribe();
          if (pollInterval) clearInterval(pollInterval);

          // Store refresh token and active session
          if (session.host_refresh_token) {
            console.log("💾 Storing refresh token and active session");
            await storeRefreshToken(session.host_refresh_token);
            await storeActiveSession(session.code);
          }

          // Initialize Spotify Player
          console.log("🎵 Initializing Spotify Player...");
          const initialized = await initializeSpotifyPlayer(
            session.host_access_token
          );

          if (initialized) {
            console.log("🎉 Success! Navigating to session screen");
            // Navigate to session screen immediately (don't wait for queue clear)
            router.push({
              pathname: "/session",
              params: {
                sessionName: `Party ${session.code}`,
                role: "host",
                partyCode: session.code,
              },
            });
            resolve();
          } else {
            console.error("❌ Failed to initialize Spotify Player");
            reject(new Error("Failed to initialize Spotify"));
          }
        }
      };

      unsubscribe = subscribeToSession(partyCode, async (session) => {
        console.log("📡 Session update received via Realtime:", {
          hasToken: !!session.host_access_token,
          code: session.code,
        });
        await handleSessionUpdate(session);
      });
    });
  };

  if (isChecking) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color="#1DB954" />
          <Text style={styles.loadingText}>Checking session...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="musical-notes" size={80} color="#1DB954" />
        <Text style={styles.title}>Connect Spotify</Text>
        <Text style={styles.subtitle}>Authorize to control playback</Text>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleLogin}
          activeOpacity={0.8}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <ActivityIndicator color="#000" />
              <Text style={styles.buttonText}> </Text>
            </>
          ) : (
            <Text style={styles.buttonText}>Continue</Text>
          )}
        </TouchableOpacity>

        {isLoading && statusMessage && (
          <Text style={styles.statusMessage}>{statusMessage}</Text>
        )}

        {isLoading && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => {
              console.log("🚫 User cancelled login");
              setIsLoading(false);
              setStatusMessage("");
              WebBrowser.dismissBrowser();
            }}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#fff",
    marginTop: 32,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#888",
    marginBottom: 64,
    textAlign: "center",
  },
  loadingText: {
    marginTop: 16,
    color: "#888",
    fontSize: 16,
  },
  button: {
    backgroundColor: "#1DB954",
    paddingVertical: 18,
    paddingHorizontal: 64,
    borderRadius: 30,
    minWidth: 200,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#000",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1,
  },
  statusMessage: {
    marginTop: 24,
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  cancelButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  cancelText: {
    color: "#ff4444",
    fontSize: 16,
    fontWeight: "600",
  },
});
