import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate a unique party code (format: A-123)
    const generatePartyCode = (): string => {
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const numbers = Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, "0");
      const letter = letters[Math.floor(Math.random() * letters.length)];
      return `${letter}-${numbers}`;
    };

    let partyCode = generatePartyCode();
    let attempts = 0;
    const maxAttempts = 10;

    // Ensure uniqueness
    while (attempts < maxAttempts) {
      const { data: existing } = await supabase
        .from("sessions")
        .select("code")
        .eq("code", partyCode)
        .single();

      if (!existing) {
        break; // Code is unique
      }
      partyCode = generatePartyCode();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new Error("Failed to generate unique party code");
    }

    console.log("🎉 Creating new session:", partyCode);

    // Create new session row (tokens will be added after auth)
    const { data: session, error } = await supabase
      .from("sessions")
      .insert({
        code: partyCode,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log("✅ Session created successfully");

    return new Response(JSON.stringify({ code: session.code }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
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
