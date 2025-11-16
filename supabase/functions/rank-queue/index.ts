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

interface SongWithFeatures {
  id: string;
  spotify_uri: string;
  song_title: string;
  song_artist: string;
  pos: number;
  features: AudioFeatures | null;
  distance?: number;
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

// Get features from dataset
async function getFeaturesFromDataset(
  songTitle: string,
  supabase: ReturnType<typeof createClient>
): Promise<AudioFeatures | null> {
  try {
    // Clean the song title (same logic as Python: .lower().strip())
    const cleanTitle = songTitle.toLowerCase().trim();

    // Use the database function to search with cleaned track names
    const { data, error } = await supabase.rpc("get_song_features", {
      search_title: cleanTitle,
    });

    if (error) {
      console.error(`Database error for ${songTitle}:`, error);
      return null;
    }

    // Type assertion for RPC result
    const results = data as
      | {
          tempo: string | number;
          energy: string | number;
          danceability: string | number;
          valence: string | number;
        }[]
      | null;

    if (!results || results.length === 0) {
      console.log(`⚠️ Song not found in dataset: ${songTitle}`);
      return null;
    }

    const song = results[0];
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
    const { session_id, currently_playing_uri } = await req.json();

    if (!session_id) {
      throw new Error("session_id required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("🎯 Starting queue ranking for session:", session_id);
    if (currently_playing_uri) {
      console.log("🎵 Currently playing:", currently_playing_uri);
    }

    // 1. Get all queued songs ordered by position (exclude played songs with NULL pos)
    const { data: allQueuedSongs, error: queueError } = await supabase
      .from("queue")
      .select("*")
      .eq("session_id", session_id)
      .eq("status", "queued")
      .not("pos", "is", null) // Exclude songs with NULL pos (played songs)
      .order("pos", { ascending: true });

    if (queueError) {
      throw new Error(`Failed to fetch queue: ${queueError.message}`);
    }

    if (!allQueuedSongs || allQueuedSongs.length === 0) {
      console.log("⚠️ No songs in queue to rank");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Queue is empty",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`📋 Found ${allQueuedSongs.length} songs in queue`);

    // 2. Separate currently playing song (if provided) - keep it at position 0
    let currentlyPlayingSong: SongWithFeatures | null = null;
    let songsToRank = allQueuedSongs;

    if (currently_playing_uri) {
      const playingIndex = allQueuedSongs.findIndex(
        (s) => s.spotify_uri === currently_playing_uri
      );
      if (playingIndex !== -1) {
        const playingSong = allQueuedSongs[playingIndex];
        currentlyPlayingSong = playingSong;
        songsToRank = allQueuedSongs.filter(
          (s) => s.spotify_uri !== currently_playing_uri
        );
        console.log(
          `🎵 Excluding currently playing song: ${playingSong.song_title}`
        );
      }
    }

    // If less than 6 songs (excluding currently playing), no need to rank
    if (songsToRank.length <= 2) {
      console.log("⚠️ Not enough songs to rank (need more than 5)");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Not enough songs to rank",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Use first 5 songs (after excluding currently playing) to establish the vibe
    const referenceSongs = songsToRank.slice(
      0,
      Math.min(2, songsToRank.length - 1)
    );

    console.log(
      `🎵 Using first ${referenceSongs.length} songs to establish vibe`
    );

    // 4. Get audio features for reference songs in parallel (optimized)
    const referenceFeaturePromises = referenceSongs.map((song) =>
      getFeaturesFromDataset(
        song.song_title,
        supabase as ReturnType<typeof createClient>
      ).then((features) => ({
        song,
        features,
      }))
    );

    const referenceResults = await Promise.all(referenceFeaturePromises);
    const referenceFeatures: AudioFeatures[] = [];

    for (const { song, features } of referenceResults) {
      if (features) {
        referenceFeatures.push(features);
        console.log(`✅ Features found for reference: ${song.song_title}`);
      } else {
        console.log(
          `❌ Features NOT found for reference: ${song.song_title} (skipping)`
        );
      }
    }

    // Need at least 1 reference song to compute vibe
    if (referenceFeatures.length === 0) {
      console.log("⚠️ Could not get features for any reference songs");
      return new Response(
        JSON.stringify({
          success: false,
          message: "Reference songs not found in dataset",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `✅ Using ${referenceFeatures.length} reference songs for vibe calculation`
    );

    // 5. Compute centroid (current vibe) from reference songs
    const centroid = computeCentroid(referenceFeatures);
    console.log("🎵 Queue vibe (centroid):", centroid);

    // 6. Compute dynamic weights based on reference songs variance
    const weights = computeDynamicWeights(referenceFeatures);
    console.log("⚖️ Dynamic weights:", weights);

    // 7. Fetch features for ALL songs in parallel (optimized for speed)
    const featurePromises = songsToRank.map((song) =>
      getFeaturesFromDataset(
        song.song_title,
        supabase as ReturnType<typeof createClient>
      ).then((features) => ({
        song,
        features,
      }))
    );

    const songFeatures = await Promise.all(featurePromises);

    // 8. Rank ALL songs (excluding currently playing) by weighted distance to centroid
    const ranked: SongWithFeatures[] = [];
    const notFound: string[] = [];

    for (const { song, features } of songFeatures) {
      if (features) {
        const dist = distance(features, centroid, weights);
        ranked.push({
          ...song,
          features,
          distance: dist,
        });
      } else {
        // Song not in dataset - put at end
        notFound.push(song.song_title);
        ranked.push({
          ...song,
          features: null,
          distance: Infinity, // Put unknown songs at the end
        });
      }
    }

    // Sort by distance (ascending = closest match first)
    ranked.sort((a, b) => {
      if (a.distance === Infinity && b.distance === Infinity) return 0;
      if (a.distance === Infinity) return 1;
      if (b.distance === Infinity) return -1;
      return a.distance! - b.distance!;
    });

    // 9. Update positions in database (optimized: parallel updates)
    // Currently playing song stays at position 0 (if exists)
    let position = 0;
    const updatePromises: Promise<unknown>[] = [];

    if (currentlyPlayingSong) {
      updatePromises.push(
        supabase
          .from("queue")
          .update({ pos: position })
          .eq("id", currentlyPlayingSong.id) as unknown as Promise<unknown>
      );
      position++;
      console.log(
        `🎵 Kept currently playing at position 0: ${currentlyPlayingSong.song_title}`
      );
    }

    // Batch all position updates in parallel for maximum speed
    for (let i = 0; i < ranked.length; i++) {
      updatePromises.push(
        supabase
          .from("queue")
          .update({ pos: position })
          .eq("id", ranked[i].id) as unknown as Promise<unknown>
      );
      position++;
    }

    // Execute all updates in parallel
    await Promise.all(updatePromises);

    const totalRanked = ranked.length + (currentlyPlayingSong ? 1 : 0);
    console.log(
      `✅ Reranked ${ranked.length} songs${
        currentlyPlayingSong ? " (kept currently playing at position 0)" : ""
      }`
    );
    if (notFound.length > 0) {
      console.log(`⚠️ Songs not in dataset (placed at end):`, notFound);
    }

    return new Response(
      JSON.stringify({
        success: true,
        ranked_count: ranked.length,
        total_songs: totalRanked,
        currently_playing_excluded: currentlyPlayingSong ? true : false,
        songs_with_features: ranked.filter((s) => s.features !== null).length,
        songs_not_found: notFound.length,
        not_found_songs: notFound,
        reference_songs_used: referenceFeatures.length,
        centroid,
        weights,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Ranking error:", error);
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
