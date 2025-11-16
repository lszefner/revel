import { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function CreateSessionScreen() {
  const router = useRouter();
  const [sessionName, setSessionName] = useState('');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'icon');

  const handleCreateSession = () => {
    if (!sessionName.trim()) {
      Alert.alert('Error', 'Please enter a session name');
      return;
    }

    // TODO: Create session in backend
    // For now, navigate to session screen with session name
    router.push({
      pathname: '/session',
      params: { sessionName, role: 'host' },
    });
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Create Session
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Give your party playlist a name
        </ThemedText>

        <TextInput
          style={[
            styles.input,
            { color: textColor, borderColor },
          ]}
          placeholder="Session name"
          placeholderTextColor={borderColor}
          value={sessionName}
          onChangeText={setSessionName}
          autoFocus
          onSubmitEditing={handleCreateSession}
        />

        <TouchableOpacity
          style={[
            styles.button,
            !sessionName.trim() && styles.buttonDisabled,
          ]}
          onPress={handleCreateSession}
          activeOpacity={0.7}
          disabled={!sessionName.trim()}>
          <ThemedText style={styles.buttonText}>Create</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: 32,
    textAlign: 'center',
    opacity: 0.7,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    fontSize: 18,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});

