import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

// Get Supabase URL and Anon Key from environment or constants
const supabaseUrl =
  Constants.expoConfig?.extra?.supabaseUrl ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "";

const supabaseAnonKey =
  Constants.expoConfig?.extra?.supabaseAnonKey ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "";

// Validate configuration
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Missing Supabase configuration!");
  console.error("URL:", supabaseUrl ? "✓" : "✗");
  console.error("Key:", supabaseAnonKey ? "✓" : "✗");
  throw new Error(
    "Missing Supabase credentials. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file"
  );
}

console.log("✅ Supabase configured:", supabaseUrl.substring(0, 30) + "...");

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Export anon key for Edge Functions (anon key is safe to use client-side)
export const supabaseKey = supabaseAnonKey;

// Edge Functions base URL
export const EDGE_FUNCTIONS_URL = supabaseUrl.replace(
  /\.supabase\.co$/,
  ".functions.supabase.co"
);

console.log("📡 Edge Functions URL:", EDGE_FUNCTIONS_URL);
