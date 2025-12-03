// Deno Edge Function - these imports are resolved at runtime by Deno
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AudioFeatures {
  tempo: number;
  energy: number;
  danceability: number;
  valence: number;
}

interface Weights {
  tempo: number;
  energy: number;
  danceability: number;
  valence: number;
}

// Compute centroid (average) of song features
function computeCentroid(features: AudioFeatures[]): AudioFeatures {
  const n = features.length;
  return {
    tempo: features.reduce((sum, f) => sum + f.tempo, 0) / n,
    energy: features.reduce((sum, f) => sum + f.energy, 0) / n,
    danceability: features.reduce((sum, f) => sum + f.danceability, 0) / n,
    valence: features.reduce((sum, f) => sum + f.valence, 0) / n,
  };
}

// Compute dynamic weights based on variance (inverse variance weighting)
// Low variance → stable feature → high weight
// High variance → inconsistent feature → low weight
function computeDynamicWeights(
  features: AudioFeatures[],
  epsilon: number = 1e-6
): Weights {
  const n = features.length;

  // Need at least 2 songs to compute variance
  if (n < 2) {
    return {
      tempo: 1.0,
      energy: 1.0,
      danceability: 1.0,
      valence: 1.0,
    };
  }

  const mean = computeCentroid(features);

  // Calculate variance for each feature
  const variance = {
    tempo:
      features.reduce((sum, f) => sum + Math.pow(f.tempo - mean.tempo, 2), 0) /
      n,
    energy:
      features.reduce(
        (sum, f) => sum + Math.pow(f.energy - mean.energy, 2),
        0
      ) / n,
    danceability:
      features.reduce(
        (sum, f) => sum + Math.pow(f.danceability - mean.danceability, 2),
        0
      ) / n,
    valence:
      features.reduce(
        (sum, f) => sum + Math.pow(f.valence - mean.valence, 2),
        0
      ) / n,
  };

  // Weight = 1 / (variance + epsilon)
  // Stable features (low variance) get higher weights
  return {
    tempo: 1 / (variance.tempo + epsilon),
    energy: 1 / (variance.energy + epsilon),
    danceability: 1 / (variance.danceability + epsilon),
    valence: 1 / (variance.valence + epsilon),
  };
}

// Calculate weighted Euclidean distance
function distance(
  song: AudioFeatures,
  centroid: AudioFeatures,
  weights: Weights
): number {
  return Math.sqrt(
    weights.tempo * Math.pow(song.tempo - centroid.tempo, 2) +
      weights.energy * Math.pow(song.energy - centroid.energy, 2) +
      weights.danceability *
        Math.pow(song.danceability - centroid.danceability, 2) +
      weights.valence * Math.pow(song.valence - centroid.valence, 2)
  );
}

// Get features from popular_songs table
async function getFeaturesFromPopularSongs(
  songTitle: string,
  supabase: ReturnType<typeof createClient>
): Promise<AudioFeatures | null> {
  try {
    // Clean the song title (same logic as Python: .lower().strip())
    const cleanTitle = songTitle.toLowerCase().trim();

    // Query popular_songs table directly
    const { data, error } = await supabase
      .from("popular_songs")
      .select("tempo, energy, danceability, valence")
      .ilike("track_name", `%${cleanTitle}%`)
      .limit(1);

    if (error) {
      console.error(`Database error for ${songTitle}:`, error);
      return null;
    }

    if (!data || data.length === 0) {
      console.log(`⚠️ Song not found in popular_songs: ${songTitle}`);
      return null;
    }

    const song = data[0];
    return {
      tempo: parseFloat(String(song.tempo)),
      energy: parseFloat(String(song.energy)),
      danceability: parseFloat(String(song.danceability)),
      valence: parseFloat(String(song.valence)),
    };
  } catch (error) {
    console.error(`Error fetching features for ${songTitle}:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { session_id, limit = 5 } = await req.json();

    if (!session_id) {
      throw new Error("session_id required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("🎯 Getting recommendations for session:", session_id);

    // EDGE CASE 1: Get last 5 played songs from session
    const { data: playedSongs, error: playedError } = await supabase
      .from("queue")
      .select("spotify_uri, song_title")
      .eq("session_id", session_id)
      .eq("status", "played")
      .order("played_at", { ascending: false })
      .limit(5);

    if (playedError) {
      throw new Error(`Failed to fetch played songs: ${playedError.message}`);
    }

    // EDGE CASE 2: No played songs = no recommendations
    if (!playedSongs || playedSongs.length === 0) {
      console.log("⚠️ No played songs yet - cannot generate recommendations");
      return new Response(
        JSON.stringify({
          success: false,
          message: "No played songs yet. Play some songs first!",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`📊 Found ${playedSongs.length} played songs`);

    // Get features for seed songs from popular_songs table
    const seedFeatures: AudioFeatures[] = [];
    for (const song of playedSongs) {
      const features = await getFeaturesFromPopularSongs(
        song.song_title,
        supabase as ReturnType<typeof createClient>
      );
      if (features) {
        seedFeatures.push(features);
        console.log(`✅ Features found for seed: ${song.song_title}`);
      } else {
        console.log(`❌ Features NOT found for seed: ${song.song_title}`);
      }
    }

    // EDGE CASE 3: No seed songs found in dataset
    if (seedFeatures.length === 0) {
      console.log("⚠️ No seed songs found in popular_songs dataset");
      return new Response(
        JSON.stringify({
          success: false,
          message: "Seed songs not found in dataset",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Compute centroid and weights
    const centroid = computeCentroid(seedFeatures);
    const weights = computeDynamicWeights(seedFeatures);
    console.log("🎵 Centroid:", centroid);
    console.log("⚖️ Weights:", weights);

    // Get all songs already in queue (to exclude)
    const { data: queuedSongs, error: queueError } = await supabase
      .from("queue")
      .select("spotify_uri")
      .eq("session_id", session_id)
      .in("status", ["queued", "played"]);

    if (queueError) {
      console.warn("⚠️ Error fetching queued songs:", queueError);
    }

    const excludeUris = new Set(
      (queuedSongs || []).map((s: { spotify_uri: string }) => s.spotify_uri)
    );
    console.log(`🚫 Excluding ${excludeUris.size} already queued songs`);

    // Query popular_songs for candidates
    // Note: We'll filter by excludeUris in JavaScript for better performance
    const { data: candidates, error: candidatesError } = await supabase
      .from("popular_songs")
      .select("*")
      .limit(1000); // Get a reasonable sample

    if (candidatesError) {
      throw new Error(`Failed to fetch candidates: ${candidatesError.message}`);
    }

    if (!candidates || candidates.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          recommendations: [],
          message: "No candidates found in popular_songs",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`📋 Found ${candidates.length} candidate songs`);

    // Filter out already queued songs and calculate distances
    interface RankedSong {
      id: string;
      track_name: string;
      artists: string;
      spotify_uri: string;
      tempo: number;
      energy: number;
      danceability: number;
      valence: number;
      distance: number;
    }
    const ranked: RankedSong[] = [];

    for (const candidate of candidates) {
      // Skip if already in queue
      if (excludeUris.has(candidate.spotify_uri)) {
        continue;
      }

      const candidateFeatures: AudioFeatures = {
        tempo: parseFloat(String(candidate.tempo)),
        energy: parseFloat(String(candidate.energy)),
        danceability: parseFloat(String(candidate.danceability)),
        valence: parseFloat(String(candidate.valence)),
      };

      const dist = distance(candidateFeatures, centroid, weights);

      ranked.push({
        id: candidate.id,
        track_name: candidate.track_name,
        artists: candidate.artists || "Unknown",
        spotify_uri: candidate.spotify_uri,
        tempo: candidateFeatures.tempo,
        energy: candidateFeatures.energy,
        danceability: candidateFeatures.danceability,
        valence: candidateFeatures.valence,
        distance: dist,
      });
    }

    // Sort by distance (ascending = closest match first)
    ranked.sort((a, b) => a.distance - b.distance);

    // Return top N recommendations
    const recommendations = ranked.slice(0, limit);

    console.log(
      `✅ Generated ${recommendations.length} recommendations from ${ranked.length} candidates`
    );

    // EDGE CASE 4: No recommendations found (all already queued)
    if (recommendations.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          recommendations: [],
          message: "All popular songs are already in queue",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        recommendations,
        seed_songs_used: seedFeatures.length,
        total_candidates: ranked.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Recommendation error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
