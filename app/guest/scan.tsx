import { getSession } from "@/utils/spotify-session";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const SCAN_SIZE = SCREEN_WIDTH * 0.75;

export default function ScanQRScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<
    "scanning" | "processing" | "error" | "success"
  >("scanning");
  const [errorMsg, setErrorMsg] = useState("");
  const scannedRef = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const resetScanner = useCallback(() => {
    setTimeout(() => {
      scannedRef.current = false;
      setStatus("scanning");
      setErrorMsg("");
    }, 2500);
  }, []);

  const handleScan = useCallback(
    async ({ data }: { data: string }) => {
      if (scannedRef.current) return;
      scannedRef.current = true;
      setStatus("processing");

      // Haptic feedback
      try {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        );
      } catch {}

      try {
        let partyCode: string;
        let sessionName: string;

        // Try JSON first
        try {
          const parsed = JSON.parse(data);
          sessionName = parsed.sessionName || "Party Session";
          partyCode = parsed.code;
        } catch {
          // Raw party code format (A-123)
          if (/^[A-Z]-\d{3}$/i.test(data.trim())) {
            partyCode = data.trim().toUpperCase();
            sessionName = `Party ${partyCode}`;
          } else {
            throw new Error("Invalid QR code");
          }
        }

        if (!partyCode) throw new Error("No party code");

        const session = await getSession(partyCode);
        if (!session) {
          setStatus("error");
          setErrorMsg("Party not found");
          resetScanner();
          return;
        }

        setStatus("success");
        setTimeout(() => {
          router.push({
            pathname: "/session",
            params: { sessionName, role: "guest", partyCode },
          });
        }, 400);
      } catch (err) {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Invalid QR code");
        resetScanner();
      }
    },
    [router, resetScanner]
  );

  // Loading permission
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#37B6FF" />
      </View>
    );
  }

  // No permission
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Ionicons name="camera-outline" size={64} color="#37B6FF" />
        <Text style={styles.permissionTitle}>Camera Access</Text>
        <Text style={styles.permissionText}>Allow camera to scan QR codes</Text>
        <TouchableOpacity
          style={styles.permissionBtn}
          onPress={requestPermission}
        >
          <Text style={styles.permissionBtnText}>Allow</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {Platform.OS === "android" && <StatusBar hidden />}

      {/* Back button */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.back()}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Scan QR Code</Text>
        <Text style={styles.subtitle}>Point at the host&apos;s QR code</Text>
      </View>

      {/* Camera */}
      <View style={styles.cameraWrapper}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={status === "scanning" ? handleScan : undefined}
        />
        {/* Corner accents */}
        <View style={[styles.corner, styles.tl]} />
        <View style={[styles.corner, styles.tr]} />
        <View style={[styles.corner, styles.bl]} />
        <View style={[styles.corner, styles.br]} />
      </View>

      {/* Status */}
      <View style={styles.statusArea}>
        {status === "scanning" && (
          <View style={styles.statusBox}>
            <Ionicons name="scan-outline" size={20} color="#37B6FF" />
            <Text style={styles.statusText}>Ready to scan</Text>
          </View>
        )}
        {status === "processing" && (
          <View style={styles.statusBox}>
            <ActivityIndicator size="small" color="#37B6FF" />
            <Text style={styles.statusText}>Joining...</Text>
          </View>
        )}
        {status === "error" && (
          <View style={[styles.statusBox, styles.errorBox]}>
            <Ionicons name="alert-circle" size={20} color="#ff4444" />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}
        {status === "success" && (
          <View style={[styles.statusBox, styles.successBox]}>
            <Ionicons name="checkmark-circle" size={20} color="#37B6FF" />
            <Text style={styles.successText}>Joining party...</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  backBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    left: 20,
    zIndex: 10,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
  },
  header: {
    position: "absolute",
    top: Platform.OS === "ios" ? 120 : 100,
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#888",
  },
  cameraWrapper: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderRadius: 24,
    overflow: "hidden",
    position: "relative",
  },
  camera: {
    width: "100%",
    height: "100%",
  },
  corner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderColor: "#37B6FF",
  },
  tl: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 24,
  },
  tr: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 24,
  },
  bl: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 24,
  },
  br: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 24,
  },
  statusArea: {
    position: "absolute",
    bottom: 100,
  },
  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    gap: 10,
  },
  errorBox: {
    backgroundColor: "rgba(255,68,68,0.15)",
  },
  successBox: {
    backgroundColor: "rgba(55,182,255,0.15)",
  },
  statusText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "500",
  },
  errorText: {
    color: "#ff4444",
    fontSize: 15,
    fontWeight: "500",
  },
  successText: {
    color: "#37B6FF",
    fontSize: 15,
    fontWeight: "500",
  },
  // Permission screen
  permissionTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    marginTop: 20,
  },
  permissionText: {
    fontSize: 14,
    color: "#888",
    marginTop: 8,
    marginBottom: 32,
  },
  permissionBtn: {
    backgroundColor: "#37B6FF",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  permissionBtnText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },
});
