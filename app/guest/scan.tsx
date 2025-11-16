import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function ScanQRScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission]);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    try {
      const sessionData = JSON.parse(data);
      const sessionName = sessionData.sessionName || "Party Session";
      const partyCode = sessionData.code;

      router.push({
        pathname: "/session",
        params: { sessionName, role: "guest", partyCode },
      });
    } catch {
      Alert.alert("Error", "Invalid QR code");
      setScanned(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Requesting camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Ionicons name="camera-outline" size={80} color="#1DB954" />
          <Text style={styles.title}>Camera Access</Text>
          <Text style={styles.subtitle}>Grant permission to scan QR codes</Text>
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Allow Camera</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.header}>
            <Text style={styles.scanTitle}>Scan QR</Text>
            <Text style={styles.scanSubtitle}>Point at host&apos;s code</Text>
          </View>

          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        </View>
      </CameraView>
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
    marginTop: 24,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#888",
    textAlign: "center",
    marginBottom: 48,
  },
  loadingText: {
    color: "#888",
    fontSize: 16,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#1DB954",
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 30,
  },
  buttonText: {
    color: "#000",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  header: {
    marginTop: 80,
    alignItems: "center",
    padding: 24,
  },
  scanTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 8,
  },
  scanSubtitle: {
    fontSize: 16,
    color: "#888",
  },
  scanArea: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 250,
    height: 250,
    marginLeft: -125,
    marginTop: -125,
  },
  corner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: "#1DB954",
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
});
