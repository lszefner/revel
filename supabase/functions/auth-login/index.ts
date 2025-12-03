// Deno Edge Function - these imports are resolved at runtime by Deno
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();

    if (!code) {
      throw new Error("Party code is required");
    }

    const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    if (!clientId || !supabaseUrl) {
      throw new Error("Missing environment variables");
    }

    const projectRef = supabaseUrl.match(/https:\/\/(.+?)\.supabase\.co/)?.[1];
    const redirectUri =
      Deno.env.get("SPOTIFY_REDIRECT_URI") ||
      `https://${projectRef}.functions.supabase.co/auth-callback`;

    const scopes = [
      "user-read-private",
      "user-read-email",
      "playlist-modify-public",
      "playlist-modify-private",
      "user-modify-playback-state",
      "user-read-playback-state",
      "user-read-currently-playing",
      "user-read-recently-played",
      "streaming",
    ];

    // Build Spotify authorization URL manually
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      state: code, // Party code passed as state
      show_dialog: "false",
    });

    const authorizeURL = `https://accounts.spotify.com/authorize?${params.toString()}`;

    return new Response(JSON.stringify({ authorizeURL }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Auth login error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
