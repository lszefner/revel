import { getWebPlayerHTML } from "@/utils/spotify-player";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
import WebView from "react-native-webview";

interface SpotifyPlayerProps {
  accessToken: string;
  onReady?: (deviceId: string) => void;
  onPlaybackState?: (state: any) => void;
  onTrackChange?: (track: any) => void;
  onError?: (error: string) => void;
}

export interface SpotifyPlayerRef {
  playTrack: (uri: string) => void;
  togglePlay: (shouldPlay: boolean) => void;
  nextTrack: () => void;
  previousTrack: () => void;
}

export const SpotifyPlayer = forwardRef<SpotifyPlayerRef, SpotifyPlayerProps>(
  function SpotifyPlayer(
    { accessToken, onReady, onPlaybackState, onTrackChange, onError },
    ref
  ) {
    const webViewRef = useRef<WebView>(null);

    const handleMessage = (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        console.log("📨 WebView message:", data.type);

        switch (data.type) {
          case "PLAYER_READY":
            console.log("✅ Player ready:", data.deviceId);
            onReady?.(data.deviceId);
            break;

          case "PLAYER_ERROR":
            console.error("❌ Player error:", data.error);
            onError?.(data.error);
            break;

          case "PLAYBACK_STATE":
            onPlaybackState?.(data.state);
            if (data.state.track) {
              onTrackChange?.(data.state.track);
            }
            break;

          case "LOG":
            console.log("🎵 Player log:", data.message);
            break;
        }
      } catch (error) {
        console.error("Error handling WebView message:", error);
      }
    };

    /**
     * Play a track
     */
    const playTrack = (uri: string) => {
      console.log("🎵 Attempting to play track:", uri);
      if (!webViewRef.current) {
        console.error("❌ WebView ref is null");
        onError?.(
          "Player not initialized. Please wait for player to be ready."
        );
        return;
      }

      const message = JSON.stringify({
        type: "PLAY_TRACK",
        uri,
      });

      console.log("📤 Sending message to WebView:", message);

      // Use injectedJavaScript for more reliable message passing
      webViewRef.current.injectJavaScript(`
        (function() {
          try {
            const data = ${message};
            if (window.handleCommand) {
              window.handleCommand(data);
            } else {
              // Fallback: dispatch event
              window.dispatchEvent(new MessageEvent('message', { data: ${message} }));
            }
            true; // Required for injectedJavaScript
          } catch (e) {
            console.error('Error in injected script:', e);
            false;
          }
        })();
      `);
    };

    /**
     * Toggle play/pause
     */
    const togglePlay = (shouldPlay: boolean) => {
      if (webViewRef.current) {
        webViewRef.current.postMessage(
          JSON.stringify({
            type: shouldPlay ? "PLAY" : "PAUSE",
          })
        );
      }
    };

    /**
     * Next track
     */
    const nextTrack = () => {
      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify({ type: "NEXT" }));
      }
    };

    /**
     * Previous track
     */
    const previousTrack = () => {
      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify({ type: "PREVIOUS" }));
      }
    };

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      playTrack,
      togglePlay,
      nextTrack,
      previousTrack,
    }));

    return (
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          source={{ html: getWebPlayerHTML(accessToken, "Revel Party") }}
          onMessage={handleMessage}
          onNavigationStateChange={(navState) => {
            // Prevent navigation away from the player
            if (
              navState.url.includes("account.spotify.com") ||
              navState.url.includes("accounts.spotify.com")
            ) {
              console.warn("🚫 Blocked navigation to:", navState.url);
              console.warn(
                "⚠️ This usually means Spotify Premium is required or the token is invalid"
              );
              onError?.(
                "Spotify Premium required or invalid session. Please ensure you have an active Spotify Premium account."
              );
              return false;
            }
          }}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error("WebView error:", nativeEvent);
            onError?.(`WebView error: ${nativeEvent.description}`);
          }}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback={true}
          userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"
          originWhitelist={["*"]}
          onShouldStartLoadWithRequest={(request) => {
            // Block any external navigation
            if (
              request.url.startsWith("http") &&
              !request.url.startsWith("https://sdk.scdn.co")
            ) {
              console.warn("🚫 Blocking external request:", request.url);
              return false;
            }
            return true;
          }}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
  },
  webview: {
    flex: 1,
    backgroundColor: "#000",
  },
});
