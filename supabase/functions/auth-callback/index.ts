// Deno Edge Function - these imports are resolved at runtime by Deno
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("🎵 Auth callback received");

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // This is the party_code

    console.log("📋 Party code (state):", state);
    console.log("🔑 Auth code:", code ? "received" : "missing");

    if (!code || !state) {
      console.error("❌ Missing parameters - code:", !!code, "state:", !!state);
      throw new Error("Missing code or state parameter");
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
    const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");

    if (!supabaseUrl || !supabaseServiceKey || !clientId || !clientSecret) {
      throw new Error("Missing environment variables");
    }

    const projectRef = supabaseUrl.match(/https:\/\/(.+?)\.supabase\.co/)?.[1];
    const redirectUri =
      Deno.env.get("SPOTIFY_REDIRECT_URI") ||
      `https://${projectRef}.functions.supabase.co/auth-callback`;

    console.log("🔄 Exchanging code for tokens...");

    // Exchange code for tokens using Spotify API
    const tokenResponse = await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error("❌ Spotify token exchange failed:", error);
      throw new Error(`Spotify token exchange failed: ${error}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in; // seconds

    console.log("✅ Tokens received from Spotify");
    console.log("⏰ Token expires in:", expiresIn, "seconds");

    // Calculate expiry timestamp
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("💾 Updating session in database for code:", state);

    // Update session with tokens
    const { error, data } = await supabase
      .from("sessions")
      .update({
        host_access_token: accessToken,
        host_refresh_token: refreshToken,
        expires_at: expiresAt,
      })
      .eq("code", state)
      .select();

    if (error) {
      console.error("❌ Database update failed:", error);
      throw new Error(`Database update failed: ${error.message}`);
    }

    console.log("✅ Session updated successfully:", data);
    console.log("🎉 Authentication complete for party code:", state);

    // Redirect back to the app with success
    console.log("🔄 Redirecting to app...");
    return new Response(null, {
      status: 302,
      headers: {
        Location: "revel://",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("❌❌❌ Auth callback error:", error);
    console.error(
      "Error details:",
      error instanceof Error ? error.message : String(error)
    );

    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Error</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#000;color:#fff}.container{text-align:center;padding:2rem}h1{font-size:28px;margin-bottom:.5rem;color:#ff4444}p{font-size:16px;color:#888}</style></head><body><div class="container"><h1>Connection Failed</h1><p>${
        error instanceof Error ? error.message : "Unknown error"
      }</p></div></body></html>`,
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        },
        status: 500,
      }
    );
  }
});
