import { EDGE_FUNCTIONS_URL, supabase, supabaseKey } from "@/config/supabase";
import {
  getActiveSession,
  getRefreshToken,
  storeActiveSession,
} from "./session-storage";

export interface SessionData {
  id: string;
  code: string;
  host_access_token: string | null;
  host_refresh_token: string | null;
  expires_at: string | null;
  created_at?: string;
}

/**
 * Check if host has an active session
 * Returns { sessionCode, refreshToken } if found
 */
export async function checkForActiveSession(): Promise<{
  sessionCode: string;
  refreshToken: string;
} | null> {
  const sessionCode = await getActiveSession();
  const refreshToken = await getRefreshToken();

  if (sessionCode && refreshToken) {
    console.log("✅ Found active session:", sessionCode);
    return { sessionCode, refreshToken };
  }

  console.log("❌ No active session found");
  return null;
}

/**
 * Path A: Refresh Spotify token ONLY (no session creation)
 */
export async function refreshSpotifyToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_at: string;
} | null> {
  try {
    const response = await fetch(`${EDGE_FUNCTIONS_URL}/auth-refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    console.log(
      "🎵 Refresh token response status:",
      response.status,
      response.statusText
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Refresh failed:", errorText);
      throw new Error(`Refresh failed: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log("✅ Token refreshed:", {
      hasAccessToken: !!data.access_token,
      expiresIn: data.expires_in,
    });

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
    };
  } catch (error) {
    console.error("Error refreshing token:", error);
    return null;
  }
}

/**
 * Create new session (only when no active session exists)
 */
export async function createNewSession(): Promise<string | null> {
  try {
    const response = await fetch(`${EDGE_FUNCTIONS_URL}/create-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Create session failed: ${response.statusText}`);
    }

    const data = await response.json();
    await storeActiveSession(data.code);
    console.log("✅ Session created:", data.code);
    return data.code;
  } catch (error) {
    console.error("Error creating session:", error);
    return null;
  }
}

/**
 * Update existing session with tokens
 */
export async function updateSessionTokens(
  sessionCode: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("sessions")
      .update({
        host_access_token: accessToken,
        host_refresh_token: refreshToken,
        expires_at: expiresAt,
      })
      .eq("code", sessionCode);

    if (error) {
      console.error("❌ Failed to update session tokens:", error);
      return false;
    }

    console.log("✅ Session tokens updated for:", sessionCode);
    return true;
  } catch (error) {
    console.error("Error updating session tokens:", error);
    return false;
  }
}

/**
 * Get authorization URL for Spotify login
 */
export async function getAuthUrl(partyCode: string): Promise<string | null> {
  try {
    console.log("📡 Calling auth-login with code:", partyCode);
    console.log("📡 URL:", `${EDGE_FUNCTIONS_URL}/auth-login`);

    const response = await fetch(`${EDGE_FUNCTIONS_URL}/auth-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ code: partyCode }),
    });

    console.log("📡 Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("📡 Response error:", errorText);
      throw new Error(`Get auth URL failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("📡 Response data:", data);
    console.log("📡 Auth URL length:", data.authorizeURL?.length || 0);
    return data.authorizeURL;
  } catch (error) {
    console.error("❌ Error getting auth URL:", error);
    return null;
  }
}

/**
 * Subscribe to session updates via Supabase realtime
 */
export function subscribeToSession(
  partyCode: string,
  onUpdate: (session: SessionData) => void
) {
  console.log("🔌 Setting up Realtime subscription for code:", partyCode);

  const channel = supabase
    .channel(`session:${partyCode}`, {
      config: {
        broadcast: { self: true },
        presence: { key: partyCode },
      },
    })
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "sessions",
        filter: `code=eq.${partyCode}`,
      },
      (payload) => {
        console.log("📨 Realtime event received:", payload.eventType);
        console.log("📦 Payload data:", {
          code: (payload.new as any)?.code,
          hasAccessToken: !!(payload.new as any)?.host_access_token,
          hasRefreshToken: !!(payload.new as any)?.host_refresh_token,
        });
        onUpdate(payload.new as SessionData);
      }
    )
    .subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        console.log("✅ Realtime subscription active");
      } else if (status === "CHANNEL_ERROR" || status === "CLOSED") {
        console.warn("⚠️ Realtime subscription issue:", status);
        if (err) {
          console.error("❌ Subscription error details:", err);
        }
        console.log("ℹ️ App will continue using polling fallback");
      } else {
        console.log("📡 Subscription status:", status);
      }
    });

  return () => {
    console.log("❌ Unsubscribing from Realtime");
    supabase.removeChannel(channel);
  };
}

/**
 * Initialize Spotify Web Playback SDK
 * Note: The actual player initialization happens in the WebView component
 * This function just validates the token
 */
export async function initializeSpotifyPlayer(
  accessToken: string
): Promise<boolean> {
  console.log("🎵 Access token:", accessToken);
  try {
    // Validate token by checking user profile
    const response = await fetch("https://api.spotify.com/v1/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    console.log("🎵 Spotify token response:", await response.json());

    return response.ok;
  } catch (error) {
    console.error("Error initializing Spotify Player:", error);
    return false;
  }
}

/**
 * Get session data from Supabase
 */
export async function getSession(
  partyCode: string
): Promise<SessionData | null> {
  try {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("code", partyCode)
      .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully

    if (error) {
      console.error("Error getting session:", error);
      return null;
    }

    if (!data) {
      console.log("⚠️ No session found for code:", partyCode);
      return null;
    }

    return data as SessionData;
  } catch (error) {
    console.error("Error getting session:", error);
    return null;
  }
}

/**
 * Check if access token is expired
 */
export function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;

  const expiryTime = new Date(expiresAt).getTime();
  const now = Date.now();

  // Consider expired if less than 5 minutes remaining
  const bufferTime = 5 * 60 * 1000; // 5 minutes

  return now >= expiryTime - bufferTime;
}
