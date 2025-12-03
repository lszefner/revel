import { getSession } from "@/utils/spotify-session";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function JoinScreen() {
  const router = useRouter();
  const [partyCode, setPartyCode] = useState("");
  const [error, setError] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  const handleScanQR = () => {
    router.push("/guest/scan");
  };

  // Format input to match party code format (LETTER-NUMBERS)
  const formatPartyCode = (input: string): string => {
    // Remove all non-alphanumeric characters
    const cleaned = input.replace(/[^A-Z0-9]/gi, "").toUpperCase();

    if (cleaned.length === 0) return "";

    // If it starts with a letter, format as LETTER-NUMBERS
    if (/^[A-Z]/.test(cleaned)) {
      const letter = cleaned[0];
      const numbers = cleaned.slice(1).replace(/\D/g, "").slice(0, 3);
      if (numbers.length > 0) {
        return `${letter}-${numbers}`;
      }
      return letter;
    }

    // If it starts with numbers, try to format
    const numbers = cleaned.replace(/\D/g, "").slice(0, 3);
    if (numbers.length > 0) {
      return `A-${numbers}`; // Default to A if no letter
    }

    return cleaned;
  };

  const handleCodeChange = (text: string) => {
    setError("");
    const formatted = formatPartyCode(text);
    setPartyCode(formatted);
  };

  const handleJoinWithCode = async () => {
    const code = partyCode.trim().toUpperCase();
    if (!code) {
      setError("Please enter a party code");
      return;
    }

    // Validate format (LETTER-NUMBERS)
    const codePattern = /^[A-Z]-\d{3}$/;
    if (!codePattern.test(code)) {
      setError("Invalid format. Use format: A-123");
      return;
    }

    setIsJoining(true);
    setError("");

    try {
      // Check if session exists before navigating
      const session = await getSession(code);

      if (!session) {
        setError("Party code not found. Please check and try again.");
        setIsJoining(false);
        return;
      }

      // Navigate to session with the entered code
      router.push({
        pathname: "/session",
        params: {
          sessionName: `Party ${code}`,
          role: "guest",
          partyCode: code,
        },
      });
    } catch (err) {
      console.error("Error checking session:", err);
      setError("Failed to join party. Please try again.");
      setIsJoining(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>
      <View style={styles.content}>
        <Ionicons name="people-outline" size={80} color="#37B6FF" />
        <Text style={styles.title}>Join Party</Text>
        <Text style={styles.subtitle}>
          Scan a QR code or enter a party code
        </Text>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={handleScanQR}
            activeOpacity={0.8}
          >
            <Ionicons name="qr-code-outline" size={24} color="#000" />
            <Text style={styles.scanButtonText}>Scan QR Code</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.codeInputContainer}>
            <TextInput
              style={[styles.codeInput, error && styles.codeInputError]}
              placeholder="A-123"
              placeholderTextColor="rgba(255, 255, 255, 0.8)"
              value={partyCode}
              onChangeText={handleCodeChange}
              autoCapitalize="characters"
              maxLength={5}
              autoFocus={false}
            />
            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color="#ff4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[
                styles.joinButton,
                (!partyCode.trim() || isJoining) && styles.joinButtonDisabled,
              ]}
              onPress={handleJoinWithCode}
              activeOpacity={0.8}
              disabled={!partyCode.trim() || isJoining}
            >
              {isJoining ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={styles.joinButtonText}>Join</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  backButton: {
    position: "absolute",
    top: 60,
    left: 20,
    zIndex: 10,
    padding: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 20,
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
    marginTop: 24,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#888",
    textAlign: "center",
    marginBottom: 48,
  },
  buttonContainer: {
    width: "100%",
    maxWidth: 400,
    gap: 24,
  },
  scanButton: {
    backgroundColor: "#37B6FF",
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  scanButtonText: {
    color: "#000",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#333",
  },
  dividerText: {
    color: "#888",
    fontSize: 14,
    fontWeight: "600",
  },
  codeInputContainer: {
    gap: 16,
  },
  codeInput: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 30,
    paddingVertical: 18,
    paddingHorizontal: 24,
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  codeInputError: {
    borderColor: "#ff4444",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: -8,
  },
  errorText: {
    color: "#ff4444",
    fontSize: 14,
    fontWeight: "500",
  },
  joinButton: {
    backgroundColor: "#37B6FF",
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: "center",
  },
  joinButtonDisabled: {
    opacity: 0.5,
  },
  joinButtonText: {
    color: "#000",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1,
  },
});
