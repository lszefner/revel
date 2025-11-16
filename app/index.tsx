import { getActiveSession } from "@/utils/session-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function MainScreen() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  // Auto-redirect if already in a session
  useEffect(() => {
    checkForActiveSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkForActiveSession = async () => {
    try {
      const sessionCode = await getActiveSession();
      if (sessionCode) {
        console.log("✅ Active session found, redirecting:", sessionCode);
        // Redirect to host login which will handle the session resume
        router.replace("/host/login");
        return;
      }
    } catch (error) {
      console.error("Error checking for active session:", error);
    }
    setIsChecking(false);
  };

  if (isChecking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1DB954" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Image
          source={require("../assets/images/icon.png")}
          style={{ width: 180, height: 180, resizeMode: "contain" }}
          accessibilityLabel="Revel Logo"
        />
        <Text style={styles.title}>Revel</Text>
        <Text style={styles.subtitle}>Party Playlist</Text>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.hostButton}
            onPress={() => router.push("/host/login")}
            activeOpacity={0.8}
          >
            <Text style={styles.hostButtonText}>Host</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.joinButton}
            onPress={() => router.push("/guest/scan")}
            activeOpacity={0.8}
          >
            <Text style={styles.joinButtonText}>Join</Text>
          </TouchableOpacity>
        </View>
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
    fontSize: 56,
    fontWeight: "700",
    color: "#fff",
    marginTop: 24,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: "#888",
    marginTop: 8,
    marginBottom: 80,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  buttonContainer: {
    width: "100%",
    maxWidth: 300,
    gap: 16,
  },
  hostButton: {
    backgroundColor: "#1DB954",
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: "center",
  },
  hostButtonText: {
    color: "#000",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1,
  },
  joinButton: {
    backgroundColor: "transparent",
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
  },
  joinButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 1,
  },
});
