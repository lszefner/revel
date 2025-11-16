import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { EDGE_FUNCTIONS_URL, supabase, supabaseKey } from "@/config/supabase";
import { useThemeColor } from "@/hooks/use-theme-color";
import { clearActiveSession } from "@/utils/session-storage";
import { searchTracks } from "@/utils/spotify-player";
import { getSession } from "@/utils/spotify-session";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";

// Animated Playing Indicator Component
const PlayingIndicator = () => {
  const bar1 = useRef(new Animated.Value(0.3)).current;
  const bar2 = useRef(new Animated.Value(0.5)).current;
  const bar3 = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    const animate = (animValue: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(animValue, {
            toValue: 1,
            duration: 400 + delay,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0.3,
            duration: 400 + delay,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    animate(bar1, 0);
    animate(bar2, 100);
    animate(bar3, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.playingIndicator}>
      <Animated.View
        style={[
          styles.playingBar,
          {
            transform: [
              {
                scaleY: bar1,
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.playingBar,
          {
            transform: [
              {
                scaleY: bar2,
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.playingBar,
          {
            transform: [
              {
                scaleY: bar3,
              },
            ],
          },
        ]}
      />
    </View>
  );
};

// Animated Song Item Component
interface AnimatedSongItemProps {
  song: Song;
  index: number;
}

const AnimatedSongItem = ({ song, index }: AnimatedSongItemProps) => {
  return (
    <View style={styles.songItem}>
      {/* Index Number */}
      <View style={styles.indexNumber}>
        <ThemedText style={styles.indexText}>{index + 1}</ThemedText>
      </View>

      {/* Album Cover */}
      {song.albumArt ? (
        <Image
          source={{ uri: song.albumArt }}
          style={styles.albumCover}
          resizeMode="cover"
          onError={() => console.log("❌ Failed to load image:", song.albumArt)}
        />
      ) : (
        <View style={styles.albumCoverPlaceholder}>
          <Ionicons name="musical-notes" size={24} color="#535353" />
        </View>
      )}

      {/* Song Info */}
      <View style={styles.songInfo}>
        <View style={styles.songTitleRow}>
          <ThemedText style={styles.songTitle} numberOfLines={1}>
            {song.title}
          </ThemedText>
        </View>
        <ThemedText style={styles.songArtist} numberOfLines={1}>
          {song.artist}
        </ThemedText>
      </View>
    </View>
  );
};

interface Song {
  id: string;
  uri: string;
  title: string;
  artist: string;
  albumArt?: string;
  durationMs?: number; // Duration in milliseconds
}

export default function SessionScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const sessionName = (params.sessionName as string) || "Party Session";
  const partyCode = (params.partyCode as string) || "";
  const role = (params.role as string) || "guest";
  const isHost = role === "host";

  const [songs, setSongs] = useState<Song[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [suggestions, setSuggestions] = useState<Song[]>([]);
  const [accessToken, setAccessToken] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [isFirstSong, setIsFirstSong] = useState(true);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<Song | null>(null);
  const [lastPlayedUri, setLastPlayedUri] = useState<string>("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [songStartedAt, setSongStartedAt] = useState<number | null>(null); // Timestamp when current song started
  const hasQueuedNextRef = useRef<boolean>(false);
  const hasMarkedAsPlayedRef = useRef<boolean>(false); // Track if current song has been marked as played
  const hasAutoPlayedRef = useRef<boolean>(false); // Track if we've already attempted auto-play
  const hasRecommendedRef = useRef<boolean>(false); // Track if we've already fetched recommendations
  const searchQueryRef = useRef<string>("");
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const searchModalAnim = useRef(new Animated.Value(0)).current;

  const textColor = useThemeColor({}, "text");

  // Fade in animation on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // QR code data
  const qrData = JSON.stringify({
    sessionName,
    code: partyCode,
  });

  // Load session data and access token
  useEffect(() => {
    const loadSessionData = async () => {
      setIsLoadingSession(true);

      if (!partyCode) {
        setIsLoadingSession(false);
        return;
      }

      console.log("📡 Loading session data for:", partyCode);
      const session = await getSession(partyCode);

      if (session && session.host_access_token) {
        console.log("✅ Session loaded, token present");
        setSessionId(session.id);

        // Check if token is expired (stored in expires_at)
        if (session.expires_at) {
          const expiryTime = new Date(session.expires_at).getTime();
          const now = Date.now();

          // If expired or expiring in less than 5 minutes, should refresh
          if (now >= expiryTime - 5 * 60 * 1000) {
            console.warn(
              "⚠️ Access token expired or expiring soon, refreshing..."
            );
            await refreshTokenIfNeeded(session);
          } else {
            const minutesRemaining = Math.floor((expiryTime - now) / 1000 / 60);
            console.log(`⏰ Token valid for ${minutesRemaining} more minutes`);
          }
        }

        setAccessToken(session.host_access_token);
        console.log("🔑 Token set, length:", session.host_access_token.length);

        // Small delay to ensure state is settled before showing UI
        setTimeout(() => setIsLoadingSession(false), 300);
      } else {
        console.error("❌ No session or token found");
        setIsLoadingSession(false);
      }
    };

    loadSessionData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyCode]);

  // Auto-refresh token before expiration
  useEffect(() => {
    if (!partyCode || !isHost) return;

    const checkAndRefreshToken = async () => {
      const session = await getSession(partyCode);

      if (!session || !session.expires_at) return;

      const expiryTime = new Date(session.expires_at).getTime();
      const now = Date.now();
      const minutesUntilExpiry = Math.floor((expiryTime - now) / 1000 / 60);

      // Refresh if token expires in less than 5 minutes
      if (minutesUntilExpiry < 5 && minutesUntilExpiry >= 0) {
        console.log(
          `⏰ Token expires in ${minutesUntilExpiry} minutes, refreshing...`
        );
        await refreshTokenIfNeeded(session);
      }
    };

    // Check every minute
    const interval = setInterval(checkAndRefreshToken, 60 * 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyCode, isHost]);

  // Helper function to refresh token
  const refreshTokenIfNeeded = async (session: any) => {
    if (!session.host_refresh_token) {
      console.error("❌ No refresh token available");
      return;
    }

    try {
      console.log("🔄 Refreshing access token...");

      // Call refresh token endpoint
      const response = await fetch(`${EDGE_FUNCTIONS_URL}/auth-refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          refresh_token: session.host_refresh_token,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Token refresh response:", errorText);
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.access_token) {
        console.log("✅ Token refreshed successfully");

        // Update session in database
        const { error } = await supabase
          .from("sessions")
          .update({
            host_access_token: data.access_token,
            host_refresh_token:
              data.refresh_token || session.host_refresh_token,
            expires_at: data.expires_at,
          })
          .eq("code", partyCode);

        if (error) {
          console.error("❌ Failed to update session:", error);
        } else {
          // Update local state
          setAccessToken(data.access_token);
          console.log("✅ Local token updated");
        }
      }
    } catch (error) {
      console.error("❌ Token refresh error:", error);
      Alert.alert(
        "Session Error",
        "Unable to refresh your session. Please restart the app.",
        [{ text: "OK" }]
      );
    }
  };

  // Auto-queue the next song (1-song queue strategy)
  const queueNextSong = useCallback(async () => {
    // Defensive checks
    if (!accessToken) {
      console.log("📭 Cannot queue: no access token");
      return;
    }

    if (songs.length === 0) {
      console.log("📭 Cannot queue: empty queue");
      return;
    }

    try {
      console.log("🔍 Looking for next song in queue...");
      console.log(`   Total songs in queue: ${songs.length}`);
      console.log(`   Currently playing: ${currentlyPlaying?.title || "none"}`);

      // Get the next song (first in queue, excluding currently playing)
      let nextSong: Song | undefined;

      if (!currentlyPlaying) {
        // No song currently playing, take the first song in queue
        nextSong = songs[0];
      } else {
        // Filter out currently playing song, then take the first remaining
        const availableSongs = songs.filter(
          (s) => s.uri !== currentlyPlaying.uri
        );
        nextSong = availableSongs[0];
      }

      // Validate next song exists and is different from currently playing
      if (!nextSong) {
        console.log("📭 No next song to queue (all filtered out)");
        return;
      }

      if (currentlyPlaying && nextSong.uri === currentlyPlaying.uri) {
        console.log("📭 Next song is same as currently playing, skipping");
        return;
      }

      console.log("➕ Auto-queuing next song:", nextSong.title);
      console.log(`   Song URI: ${nextSong.uri}`);

      // Validate URI before making request
      if (!nextSong.uri || !nextSong.uri.startsWith("spotify:track:")) {
        console.error("❌ Invalid song URI:", nextSong.uri);
        return;
      }

      const response = await fetch(
        `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(
          nextSong.uri
        )}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.status === 404) {
        console.warn("⚠️ No active device for auto-queue");
        console.warn("   Make sure Spotify is playing on an active device");
      } else if (response.status === 403) {
        console.warn("⚠️ Premium required for auto-queue");
        console.warn("   Spotify Premium is required to queue songs");
      } else if (response.status === 401) {
        console.error("❌ Authentication failed - token may be expired");
        console.error("   Token refresh may be needed");
      } else if (response.ok) {
        console.log("✅ Next song queued successfully:", nextSong.title);
        hasQueuedNextRef.current = true;
      } else {
        const errorText = await response.text();
        console.error(
          "❌ Failed to queue next song:",
          response.status,
          response.statusText
        );
        console.error("   Error details:", errorText);
        console.error("   Song URI:", nextSong.uri);
      }
    } catch (error) {
      console.error("❌ Exception queuing next song:", error);
      if (error instanceof Error) {
        console.error("   Error message:", error.message);
        console.error("   Stack trace:", error.stack);
      }
    }
  }, [accessToken, songs, currentlyPlaying]);

  // Helper function to mark played song (for ranking algorithm)
  const deletePlayedSong = useCallback(
    async (spotifyUri: string) => {
      if (!sessionId) return;

      try {
        console.log("🗑️ === DELETING PLAYED SONG ===");
        console.log("URI:", spotifyUri);

        // IMMEDIATELY remove from local state for instant UI update
        setSongs((prevSongs) => {
          const filtered = prevSongs.filter((s) => s.uri !== spotifyUri);
          console.log(
            `📊 Local state: ${prevSongs.length} -> ${filtered.length} songs`
          );
          return filtered;
        });

        // Update database: mark as played, set played_at, and clear pos
        console.log("session_id", sessionId);
        console.log("spotify_uri", spotifyUri);
        const { data, error } = await supabase
          .from("queue")
          .update({
            status: "played",
            played_at: new Date().toISOString(),
            pos: null, // Clear position so it doesn't influence ordering
          })
          .eq("session_id", sessionId)
          .eq("spotify_uri", spotifyUri)
          .eq("status", "queued") // Only update if still queued (prevent double updates)
          .select(); // Return updated rows

        if (error) {
          console.error("❌ Database update error:", error);
        } else {
          console.log("✅ Database updated, affected rows:", data?.length || 0);
          console.log("Updated row:", JSON.stringify(data, null, 2));
          console.log("   Status: played, played_at set, pos cleared to NULL");
          // Note: Queue reload and ranking will be handled by Realtime subscription
        }
      } catch (error) {
        console.error("❌ Exception marking song as played:", error);
      }
    },
    [sessionId]
  );

  // Fetch full track details from Spotify API
  const fetchTrackDetails = useCallback(
    async (uri: string): Promise<Song | null> => {
      if (!accessToken) {
        console.error("❌ No access token for fetching track details");
        return null;
      }

      try {
        // Extract track ID from URI (spotify:track:ID)
        const trackId = uri.replace("spotify:track:", "");

        const response = await fetch(
          `https://api.spotify.com/v1/tracks/${trackId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (!response.ok) {
          console.error("❌ Failed to fetch track details:", response.status);
          return null;
        }

        const track = await response.json();

        return {
          id: track.id,
          uri: track.uri,
          title: track.name,
          artist: track.artists.map((a: any) => a.name).join(", "),
          albumArt: track.album?.images?.[0]?.url || undefined,
          durationMs: track.duration_ms,
        };
      } catch (error) {
        console.error("❌ Error fetching track details:", error);
        return null;
      }
    },
    [accessToken]
  );

  // Add song to Spotify queue
  const addToSpotifyQueue = useCallback(
    async (song: Song): Promise<boolean> => {
      if (!accessToken || !song.uri) return false;

      try {
        const response = await fetch(
          `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(
            song.uri
          )}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (response.ok || response.status === 204) {
          console.log(`✅ Added to Spotify queue: ${song.title}`);
          return true;
        } else if (response.status === 404) {
          console.warn("⚠️ No active device for Spotify queue");
          return false;
        } else {
          console.warn(`⚠️ Failed to add to Spotify queue: ${response.status}`);
          return false;
        }
      } catch (error) {
        console.error("❌ Error adding to Spotify queue:", error);
        return false;
      }
    },
    [accessToken]
  );

  // Fetch recommendations from Edge Function
  const fetchRecommendations = useCallback(async (): Promise<Song[]> => {
    if (!sessionId) {
      console.error("❌ No session ID for recommendations");
      return [];
    }

    try {
      console.log("🤖 Fetching AI recommendations...");

      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/get-recommendations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            limit: 1, // Get ONE glorious recommendation to save the day
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Recommendations failed:", response.status, errorText);
        return [];
      }

      const data = await response.json();

      if (!data.success) {
        console.log("⚠️ Recommendations:", data.message);
        return [];
      }

      if (!data.recommendations || data.recommendations.length === 0) {
        console.log("⚠️ No recommendations returned");
        return [];
      }

      console.log(
        `✅ Got ${data.recommendations.length} recommendations (seed songs: ${data.seed_songs_used})`
      );

      // Helper function to convert Spotify URL to URI format
      const convertSpotifyUrlToUri = (urlOrUri: string): string => {
        // If already in URI format, return as-is
        if (urlOrUri.startsWith("spotify:track:")) {
          return urlOrUri;
        }
        // Convert URL to URI format: https://open.spotify.com/track/ID -> spotify:track:ID
        const urlMatch = urlOrUri.match(/track\/([a-zA-Z0-9]+)/);
        if (urlMatch) {
          return `spotify:track:${urlMatch[1]}`;
        }
        // If no match, return original (might be invalid)
        console.warn("⚠️ Could not convert Spotify URL to URI:", urlOrUri);
        return urlOrUri;
      };

      // Fetch full details for each recommendation from Spotify
      const recommendedSongs: Song[] = [];
      for (const rec of data.recommendations) {
        // Convert URL to URI format if needed
        const uri = convertSpotifyUrlToUri(rec.spotify_uri);
        const fullSong = await fetchTrackDetails(uri);
        if (fullSong) {
          recommendedSongs.push(fullSong);
        } else {
          // Fallback to basic info if Spotify fetch fails
          recommendedSongs.push({
            id: rec.id,
            uri: uri, // Use converted URI
            title: rec.track_name,
            artist: rec.artists,
            albumArt: undefined,
            durationMs: undefined,
          });
        }
      }

      return recommendedSongs;
    } catch (error) {
      console.error("❌ Error fetching recommendations:", error);
      return [];
    }
  }, [sessionId, fetchTrackDetails]);

  // Helper function to insert song into database queue
  const insertSongToQueue = useCallback(
    async (song: Song) => {
      if (!sessionId) {
        console.error("❌ No session ID for queue insertion");
        return;
      }

      try {
        // Get the next order number
        const { data: queueData } = await supabase
          .from("queue")
          .select("pos")
          .eq("session_id", sessionId)
          .order("pos", { ascending: false })
          .limit(1);

        const nextOrder =
          queueData && queueData.length > 0 ? queueData[0].pos + 1 : 0;

        // Insert the song
        const { error } = await supabase.from("queue").insert({
          session_id: sessionId,
          spotify_uri: song.uri,
          song_title: song.title,
          song_artist: song.artist,
          album_art_url: song.albumArt || null,
          duration_ms: song.durationMs || null, // Store duration in database
          pos: nextOrder,
          status: "queued",
        });

        if (error) {
          console.error("❌ Error inserting to queue:", error);
        } else {
          console.log("✅ Song added to queue in database");
        }
      } catch (error) {
        console.error("❌ Exception inserting to queue:", error);
      }
    },
    [sessionId]
  );

  // Load queue function (defined with useCallback so it can be called from anywhere)
  const loadQueue = useCallback(async () => {
    if (!sessionId) return;

    console.log("🔄 === LOADING QUEUE === Session:", sessionId);
    const { data, error } = await supabase
      .from("queue")
      .select("*")
      .eq("session_id", sessionId)
      .eq("status", "queued") // ONLY load queued songs, never played ones
      .not("pos", "is", null) // Exclude songs with NULL pos (played songs)
      .order("pos", { ascending: true });

    if (error) {
      console.error("❌ Error loading queue:", error);
      return;
    }

    console.log("📊 Raw queue data from DB:", JSON.stringify(data, null, 2));

    if (data) {
      console.log(`✅ Loaded ${data.length} queued songs`);
      const loadedSongs: Song[] = data.map((item: any) => ({
        id: item.id,
        uri: item.spotify_uri,
        title: item.song_title,
        artist: item.song_artist,
        albumArt: item.album_art_url,
        durationMs: item.duration_ms || undefined, // Load duration from database
      }));

      // Log the order for debugging
      console.log("📋 Queue order:");
      loadedSongs.forEach((song, idx) => {
        console.log(`  ${idx + 1}. ${song.title} (${song.uri})`);
      });

      setSongs(loadedSongs);
      // If songs exist, we're past the first song
      if (loadedSongs.length > 0) {
        setIsFirstSong(false);
      }
    } else {
      // No data means empty queue
      console.log("📋 Queue is empty - no data returned");
      setSongs([]);
    }
  }, [sessionId]);

  const triggerRanking = useCallback(async () => {
    if (!sessionId || !isHost) return;

    try {
      console.log("🎯 Triggering queue ranking...");

      const response = await fetch(`${EDGE_FUNCTIONS_URL}/rank-queue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          session_id: sessionId,
          currently_playing_uri: currentlyPlaying?.uri || null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("✅ === RANKING COMPLETE ===");
        console.log("Result:", JSON.stringify(data, null, 2));

        if (data.songs_not_found > 0) {
          console.warn("⚠️ Some songs not in dataset:", data.not_found_songs);
        }

        // FORCE reload queue after ranking to show new order
        console.log(
          "🔄 Force reloading queue in 1 second to show ranked order..."
        );
        setTimeout(() => {
          loadQueue();
        }, 1000);
      } else {
        const errorText = await response.text();
        console.error("❌ Ranking failed:", response.status, errorText);
      }
    } catch (error) {
      console.error("❌ Ranking error:", error);
    }
  }, [sessionId, isHost, currentlyPlaying, loadQueue]);

  // Add recommendations to queue (database + Spotify)
  const addRecommendationsToQueue = useCallback(
    async (recommendedSongs: Song[]) => {
      if (recommendedSongs.length === 0) return;

      // Check if user has added songs - if so, cancel recommendations
      // This prevents race conditions where recommendation was fetched but user added song before it was added
      // Allow if queue is empty (0) - that's when we need recommendations most!
      if (songs.length > 1) {
        console.log(
          "🛑 User has added songs - cancelling recommendation addition"
        );
        hasRecommendedRef.current = true; // Set flag to prevent future recommendations
        return;
      }

      // Filter out songs that match the last played song (prevent duplicates)
      const filteredSongs = recommendedSongs.filter(
        (song) => song.uri !== lastPlayedUri
      );

      if (filteredSongs.length === 0) {
        console.log("🛑 Recommended song matches last played - skipping");
        hasRecommendedRef.current = false; // Reset to allow retry
        return;
      }

      console.log(
        `➕ Adding ${filteredSongs.length} recommendations to queue...`
      );

      // Add each recommendation to database and Spotify queue in parallel
      const promises = filteredSongs.map(async (song) => {
        // Add to database
        await insertSongToQueue(song);
        // Add to Spotify queue (if host)
        if (isHost && accessToken) {
          await addToSpotifyQueue(song);
        }
      });

      await Promise.all(promises);

      // Reload queue to pick up the new recommendations (they'll be filtered from UI)
      // This ensures they're in the system for ranking and Spotify queue management
      setTimeout(() => {
        loadQueue();
      }, 500);

      // Trigger ranking after adding recommendations
      setTimeout(() => {
        triggerRanking();
      }, 1000);

      console.log("✅ Recommendations added to queue (hidden from UI)");
    },
    [
      isHost,
      accessToken,
      insertSongToQueue,
      addToSpotifyQueue,
      triggerRanking,
      songs,
      lastPlayedUri,
      loadQueue,
    ]
  );

  // Timer-based approach: Calculate time remaining using local timer instead of API calls
  useEffect(() => {
    if (!isHost || !currentlyPlaying || !songStartedAt) return;

    // Reset flags when song changes
    hasMarkedAsPlayedRef.current = false;
    // Reset recommendation flag when a new song starts playing
    // This allows recommendations to trigger again for the next last song
    hasRecommendedRef.current = false;

    const calculateTimeRemaining = () => {
      if (!currentlyPlaying?.durationMs || !songStartedAt) {
        return null;
      }

      const elapsed = Date.now() - songStartedAt;
      const timeRemaining = currentlyPlaying.durationMs - elapsed;
      console.log(timeRemaining);

      return timeRemaining > 0 ? timeRemaining : 0;
    };

    // Check every second for auto-queue timing and recommendations
    const timer = setInterval(() => {
      const timeRemaining = calculateTimeRemaining();

      // Check if this is the LAST song in queue and we're at 20 seconds remaining
      // Last song means: queue is empty (0 songs) OR queue has exactly 1 song matching currently playing
      const isLastSong =
        currentlyPlaying &&
        (songs.length === 0 || // Queue is empty, currently playing is the last one
          (songs.length === 1 && songs[0]?.uri === currentlyPlaying.uri)); // Or exactly 1 song matching current

      // Don't recommend if user has added songs (queue length > 1 means user took control)
      // But allow if queue is empty (0) - that means we're on the last song
      const userHasAddedSongs = songs.length > 1;

      // Debug logging for recommendation trigger
      if (
        timeRemaining !== null &&
        timeRemaining <= 25000 &&
        timeRemaining > 15000 &&
        isLastSong &&
        !userHasAddedSongs &&
        isHost &&
        accessToken &&
        sessionId
      ) {
        console.log(
          `🔍 Recommendation check: timeRemaining=${Math.floor(
            timeRemaining / 1000
          )}s, isLastSong=${isLastSong}, hasRecommended=${
            hasRecommendedRef.current
          }, songs.length=${songs.length}`
        );
      }

      // Trigger recommendation when crossing 20-second threshold (narrow window: 20-21 seconds)
      if (
        timeRemaining !== null &&
        timeRemaining <= 21000 &&
        timeRemaining > 20000 && // Narrow window: trigger between 20-21 seconds (1 second window)
        isLastSong &&
        !userHasAddedSongs && // Don't recommend if user has added songs
        !hasRecommendedRef.current &&
        isHost &&
        accessToken &&
        sessionId
      ) {
        console.log(
          `✨ LAST SONG - ${Math.floor(
            timeRemaining / 1000
          )} seconds remaining! Fetching glorious recommendation to save the day...`
        );
        hasRecommendedRef.current = true; // Prevent multiple calls

        // Fetch recommendation inline to avoid dependency issues
        fetchRecommendations()
          .then((recommendedSongs) => {
            if (recommendedSongs.length > 0) {
              const gloriousSong = recommendedSongs[0];
              console.log(
                `🎵 Glorious recommendation: ${gloriousSong.title} by ${gloriousSong.artist}`
              );
              return addRecommendationsToQueue([gloriousSong]);
            } else {
              console.log(
                "⚠️ No recommendations returned from API - keeping flag set to prevent retries"
              );
              // DON'T reset flag - keep it true to prevent retries every second
              // This is a valid state (e.g., no played songs yet)
            }
          })
          .then(() => {
            console.log("✅ Glorious song added! The day is saved! 🎉");
          })
          .catch((error) => {
            console.error("❌ Error fetching recommendation:", error);
            hasRecommendedRef.current = false; // Only reset on actual errors
          });
      }

      if (
        timeRemaining !== null &&
        timeRemaining < 15000 &&
        !hasQueuedNextRef.current
      ) {
        console.log(
          `⏰ Song ending soon (${Math.floor(
            timeRemaining / 1000
          )}s left), checking queue...`
        );
        queueNextSong().catch((error) => {
          console.error("❌ Error in auto-queue:", error);
        });
      }

      // If song has finished (timeRemaining <= 0), mark it as played ONCE
      if (
        timeRemaining !== null &&
        timeRemaining <= 0 &&
        currentlyPlaying &&
        !hasMarkedAsPlayedRef.current
      ) {
        console.log("🎵 Song finished, marking as played");
        hasMarkedAsPlayedRef.current = true; // Set flag immediately to prevent multiple calls
        deletePlayedSong(currentlyPlaying.uri).catch((error) => {
          console.error("❌ Error marking song as played:", error);
          hasMarkedAsPlayedRef.current = false; // Reset on error so it can retry
        });
      }
    }, 1000);

    return () => {
      clearInterval(timer);
      hasMarkedAsPlayedRef.current = false; // Reset when effect cleans up
    };
  }, [
    isHost,
    currentlyPlaying,
    songStartedAt,
    queueNextSong,
    deletePlayedSong,
    songs,
    accessToken,
    sessionId,
    fetchRecommendations,
    addRecommendationsToQueue,
  ]);

  // Minimal API check for song changes (every 30 seconds instead of 3)
  useEffect(() => {
    if (!accessToken || !isHost) return;

    const checkSongChange = async () => {
      try {
        const response = await fetch(
          "https://api.spotify.com/v1/me/player/currently-playing",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (response.status === 200) {
          const data = await response.json();
          if (data.item) {
            const newUri = data.item.uri;

            // If the song changed, update state and reset timer
            if (lastPlayedUri && lastPlayedUri !== newUri) {
              console.log(
                "🗑️ Song changed, deleting previous song:",
                lastPlayedUri
              );
              await deletePlayedSong(lastPlayedUri);
              hasQueuedNextRef.current = false;
              hasMarkedAsPlayedRef.current = false; // Reset flag for new song

              // Find the new song in our queue to get full details
              const newSong = songs.find((s) => s.uri === newUri);
              if (newSong) {
                setLastPlayedUri(newUri);
                setCurrentlyPlaying(newSong);
                setSongStartedAt(Date.now()); // Reset timer for new song
              } else {
                // Song not in our queue, create minimal song object
                const minimalSong: Song = {
                  id: data.item.id,
                  uri: newUri,
                  title: data.item.name,
                  artist: data.item.artists.map((a: any) => a.name).join(", "),
                  albumArt: data.item.album.images[0]?.url,
                  durationMs: data.item.duration_ms,
                };
                setLastPlayedUri(newUri);
                setCurrentlyPlaying(minimalSong);
                setSongStartedAt(Date.now());
              }
            } else if (!lastPlayedUri) {
              // First song detection
              const newSong = songs.find((s) => s.uri === newUri);
              if (newSong) {
                setLastPlayedUri(newUri);
                setCurrentlyPlaying(newSong);
                setSongStartedAt(Date.now());
              }
            }
          }
        } else if (response.status === 204) {
          // No song playing
          setCurrentlyPlaying(null);
          setSongStartedAt(null);
        }
      } catch (error) {
        console.error("Error checking song change:", error);
      }
    };

    // Check less frequently (every 30 seconds) to avoid rate limiting
    checkSongChange();
    const interval = setInterval(checkSongChange, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, isHost, lastPlayedUri, sessionId, songs]);

  // Load existing queue from database
  useEffect(() => {
    if (!sessionId) return;

    loadQueue();

    // Subscribe to queue changes
    const channel = supabase
      .channel(`queue:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "queue",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload: any) => {
          console.log("📡 === REALTIME EVENT ===");
          console.log("Event type:", payload.eventType);
          console.log("New data:", JSON.stringify(payload.new, null, 2));
          console.log("Old data:", JSON.stringify(payload.old, null, 2));

          // Reload queue when changes occur
          console.log("🔄 Reloading queue due to Realtime event...");
          loadQueue();
        }
      )
      .subscribe((status) => {
        console.log("📡 Realtime subscription status:", status);
        if (status === "SUBSCRIBED") {
          console.log("✅ Successfully subscribed to queue updates");
        } else if (status === "CHANNEL_ERROR" || status === "CLOSED") {
          console.warn("⚠️ Realtime subscription issue:", status);
          console.log("ℹ️ App will continue using polling fallback");
        }
      });

    return () => {
      console.log("📡 Unsubscribing from queue channel");
      channel.unsubscribe();
    };
  }, [sessionId, loadQueue]);

  // Play a song on Spotify (starts fresh playback)
  const playSongOnSpotify = useCallback(
    async (song: Song) => {
      // Use Spotify Web API
      console.log("🎵 Playing via Spotify API");
      try {
        const devicesResponse = await fetch(
          "https://api.spotify.com/v1/me/player/devices",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        let playDeviceId = null;

        if (devicesResponse.ok) {
          const devices = await devicesResponse.json();
          const activeDevice = devices.devices?.find(
            (d: any) => d.is_active || d.type === "Smartphone"
          );

          if (activeDevice) {
            playDeviceId = activeDevice.id;
          } else if (devices.devices?.length > 0) {
            playDeviceId = devices.devices[0].id;
          }
        }

        const playUrl = playDeviceId
          ? `https://api.spotify.com/v1/me/player/play?device_id=${playDeviceId}`
          : "https://api.spotify.com/v1/me/player/play";

        const response = await fetch(playUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            uris: [song.uri],
          }),
        });

        if (response.status === 404) {
          Alert.alert(
            "No Active Device",
            "Please open Spotify on your device first.",
            [{ text: "OK" }]
          );
          // Throw error so caller can handle retry logic
          throw new Error("No active device - Spotify not open");
        } else if (response.status === 403) {
          Alert.alert(
            "Spotify Premium Required",
            "You need Spotify Premium to control playback.",
            [{ text: "OK" }]
          );
          // Throw error so caller can handle retry logic
          throw new Error("Spotify Premium required");
        } else if (!response.ok) {
          const errorText = await response.text();
          console.error("❌ Play failed:", response.status, errorText);
          Alert.alert(
            "Playback Error",
            `Failed to play song (${response.status})`
          );
          // Throw error so caller can handle retry logic
          throw new Error(`Playback failed: ${response.status}`);
        } else {
          console.log("✅ Song playing!");
          // Set start time for timer-based tracking
          setSongStartedAt(Date.now());
          setCurrentlyPlaying(song);
          setLastPlayedUri(song.uri);
          hasMarkedAsPlayedRef.current = false; // Reset flag for new song
        }
      } catch (error) {
        console.error("❌ Error playing song:", error);
        // Only show alert if it's not already shown (404/403 cases)
        if (
          !(
            error instanceof Error && error.message.includes("No active device")
          )
        ) {
          Alert.alert("Error", "Failed to play song");
        }
        // Re-throw so caller can handle retry
        throw error;
      }
    },
    [accessToken]
  );

  // Helper function to attempt auto-play
  const attemptAutoPlay = useCallback(async () => {
    if (!isHost || !accessToken || !sessionId) return false;
    if (currentlyPlaying) {
      hasAutoPlayedRef.current = false;
      return false;
    }
    if (songs.length === 0) {
      hasAutoPlayedRef.current = false;
      return false;
    }
    if (hasAutoPlayedRef.current) return false; // Already attempted

    const firstSong = songs[0];
    if (!firstSong) return false;

    console.log("🎵 Attempting to auto-play first song:", firstSong.title);
    hasAutoPlayedRef.current = true;

    try {
      await playSongOnSpotify(firstSong);
      return true;
    } catch (error) {
      console.error("❌ Error auto-playing first song:", error);
      // Reset flag on error so it can retry
      hasAutoPlayedRef.current = false;
      return false;
    }
  }, [
    isHost,
    accessToken,
    sessionId,
    songs,
    currentlyPlaying,
    playSongOnSpotify,
  ]);

  // Auto-play first song if nothing is playing and queue has songs
  useEffect(() => {
    attemptAutoPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, currentlyPlaying, isHost, accessToken, sessionId]);

  // Retry auto-play when app comes back into focus (user might have opened Spotify)
  useEffect(() => {
    if (!isHost || !accessToken) return;

    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === "active") {
        // App came to foreground - check if we need to retry auto-play
        console.log("📱 App active - checking if auto-play needed");
        // Small delay to ensure Spotify is ready
        setTimeout(() => {
          attemptAutoPlay();
        }, 1000);
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      subscription.remove();
    };
  }, [isHost, accessToken, attemptAutoPlay]);

  // Update ref whenever searchQuery changes
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  // Real-time Spotify search (instant on type)
  useEffect(() => {
    // Clear suggestions immediately if input is empty or no token
    if (!accessToken || searchQuery.trim().length === 0) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;

    // Search immediately (no debounce for instant results)
    const performSearch = async () => {
      try {
        const results = await searchTracks(accessToken, searchQuery, 5);

        // Don't update if this search was cancelled or query is now empty
        if (cancelled || searchQueryRef.current.trim().length === 0) {
          return;
        }

        const mappedSuggestions: Song[] = results.map((track: any) => ({
          id: track.id,
          uri: track.uri,
          title: track.name,
          artist: track.artists.map((a: any) => a.name).join(", "),
          albumArt: track.album.images[0]?.url,
          durationMs: track.duration_ms, // Store duration from search results
        }));
        setSuggestions(mappedSuggestions);
      } catch (error) {
        console.error("Search error:", error);
        if (!cancelled && searchQueryRef.current.trim().length > 0) {
          setSuggestions([]);
        }
      }
    };

    performSearch();

    // Cleanup: cancel search if query changes or component unmounts
    return () => {
      cancelled = true;
    };
  }, [searchQuery, accessToken]);

  const handleAddSong = async (song: Song) => {
    // Stop recommendations when user adds a song - user takes control!
    // Note: The check for userHasAddedSongs (songs.length > 1) handles blocking recommendations
    console.log("👤 User added song - stopping recommendations");

    // Batch UI state updates
    setSearchQuery("");
    setSuggestions([]);
    setSearchFocused(false);

    // Animate search modal close (non-blocking)
    Animated.timing(searchModalAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();

    // Immediately add to local state for instant UI feedback
    console.log("➕ Adding song to local UI immediately:", song.title);
    setSongs((prevSongs) => [...prevSongs, song]);

    // Run database and Spotify operations in parallel for better performance
    const dbPromise = insertSongToQueue(song);

    // Handle Spotify playback (only for first song)
    if (isHost && accessToken) {
      let spotifyPromise: Promise<void> = Promise.resolve();

      if (isFirstSong) {
        console.log("🎵 First song - starting playback");
        try {
          spotifyPromise = playSongOnSpotify(song);
          await spotifyPromise;
          // Only set isFirstSong to false if playback succeeds
          setIsFirstSong(false);
        } catch (error) {
          console.error("❌ Failed to play first song:", error);
          // Keep isFirstSong as true so it can retry later
          // Don't throw - let the song be added to queue anyway
        }
      }
      // Subsequent songs: Just add to DB, auto-queue will handle Spotify

      // Wait for database operation (playback handled above)
      await dbPromise;
    } else {
      // Guest or no token: just wait for DB
      await dbPromise;
    }

    // Trigger ranking after adding (only for host)
    if (isHost) {
      setTimeout(() => triggerRanking(), 1000);
    }
  };

  const handleSearchFocus = () => {
    setSearchFocused(true);
    Animated.spring(searchModalAnim, {
      toValue: 1,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  const handleSearchClose = () => {
    setSearchQuery("");
    setSuggestions([]);
    setSearchFocused(false);
    Animated.timing(searchModalAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const handleEndSession = () => {
    setShowEndModal(true);
  };

  const confirmEndSession = async () => {
    if (!sessionId) {
      console.error("❌ No session ID to delete");
      await clearActiveSession();
      router.replace("/");
      return;
    }

    try {
      console.log("🗑️ Deleting session from database:", sessionId);

      // Delete the session - CASCADE will automatically delete all queue entries
      const { error } = await supabase
        .from("sessions")
        .delete()
        .eq("id", sessionId);

      if (error) {
        console.error("❌ Error deleting session:", error);
        Alert.alert("Error", "Failed to delete session. Please try again.", [
          { text: "OK" },
        ]);
        return;
      }

      console.log("✅ Session deleted successfully");

      // Clear local storage
      await clearActiveSession();
      setIsFirstSong(true);
      setShowEndModal(false);
      console.log("🎉 Session ended by host");
      router.replace("/");
    } catch (error) {
      console.error("❌ Exception ending session:", error);
      Alert.alert("Error", "An error occurred while ending the session.", [
        { text: "OK" },
      ]);
    }
  };

  // Show loading state during initial session load
  if (isLoadingSession) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: "#000" }]}>
        <View style={styles.loadingContainer}>
          <Ionicons name="musical-notes" size={64} color="#1DB954" />
          <ThemedText style={styles.loadingText}>Loading session...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: "#000" }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="subtitle">Revel</ThemedText>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              onPress={() => setShowQR(!showQR)}
              style={styles.qrButton}
            >
              <Ionicons name="qr-code" size={24} color={textColor} />
            </TouchableOpacity>
            {isHost && (
              <TouchableOpacity
                onPress={handleEndSession}
                style={styles.qrButton}
              >
                <Ionicons name="close-circle" size={24} color="#ff4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* QR Code Modal */}
        {showQR && (
          <View style={styles.qrOverlay}>
            <TouchableOpacity
              style={styles.qrClose}
              onPress={() => setShowQR(false)}
            >
              <Ionicons name="close" size={32} color="#fff" />
            </TouchableOpacity>
            <View style={styles.qrContainer}>
              <QRCode value={qrData} size={250} />
              <ThemedText style={styles.qrText}>
                Scan to join {partyCode}
              </ThemedText>
            </View>
          </View>
        )}

        {/* End Session Modal */}
        {showEndModal && (
          <View style={styles.modalOverlay}>
            <View style={styles.endModal}>
              <ThemedText style={styles.endModalTitle}>End Session?</ThemedText>
              <ThemedText style={styles.endModalText}>
                This will end your party session. You can start a new one
                anytime.
              </ThemedText>
              <View style={styles.endModalButtons}>
                <TouchableOpacity
                  style={styles.endModalCancel}
                  onPress={() => setShowEndModal(false)}
                >
                  <ThemedText style={styles.endModalCancelText}>
                    Cancel
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.endModalConfirm}
                  onPress={confirmEndSession}
                >
                  <ThemedText style={styles.endModalConfirmText}>
                    End
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Currently Playing */}
        {currentlyPlaying && (
          <Animated.View
            style={[
              styles.nowPlayingContainer,
              {
                opacity: fadeAnim,
                transform: [
                  {
                    translateY: fadeAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.nowPlayingHeader}>
              <PlayingIndicator />
              <ThemedText style={styles.nowPlayingLabel}>
                NOW PLAYING
              </ThemedText>
            </View>
            <View style={styles.nowPlayingContent}>
              {currentlyPlaying.albumArt ? (
                <Image
                  source={{ uri: currentlyPlaying.albumArt }}
                  style={styles.nowPlayingAlbum}
                />
              ) : (
                <View style={styles.nowPlayingAlbumPlaceholder}>
                  <Ionicons name="musical-notes" size={48} color="#535353" />
                </View>
              )}
              <View style={styles.nowPlayingInfo}>
                <ThemedText style={styles.nowPlayingTitle} numberOfLines={1}>
                  {currentlyPlaying.title}
                </ThemedText>
                <ThemedText style={styles.nowPlayingArtist} numberOfLines={1}>
                  {currentlyPlaying.artist}
                </ThemedText>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Search Trigger Button */}
        <View style={styles.searchContainer}>
          <TouchableOpacity
            style={styles.searchBar}
            onPress={handleSearchFocus}
            activeOpacity={0.8}
          >
            <Ionicons
              name="search"
              size={20}
              color="#B3B3B3"
              style={styles.searchIcon}
            />
            <ThemedText style={styles.searchPlaceholder}>
              Search songs...
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Full-Screen Search Modal */}
        {searchFocused && (
          <Animated.View
            style={[
              styles.searchModal,
              {
                opacity: searchModalAnim,
                transform: [
                  {
                    translateY: searchModalAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [50, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.searchModalHeader}>
              <TouchableOpacity
                onPress={handleSearchClose}
                style={styles.searchBackButton}
              >
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
              <View style={styles.searchModalInputContainer}>
                <Ionicons
                  name="search"
                  size={20}
                  color="#B3B3B3"
                  style={styles.searchIcon}
                />
                <TextInput
                  style={styles.searchModalInput}
                  placeholder="Search songs..."
                  placeholderTextColor="rgba(255, 255, 255, 0.4)"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <Ionicons name="close-circle" size={20} color="#B3B3B3" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Search Results */}
            <ScrollView
              style={styles.searchModalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {suggestions.length > 0 ? (
                suggestions.map((song) => (
                  <TouchableOpacity
                    key={song.id}
                    style={styles.searchModalSongItem}
                    onPress={() => handleAddSong(song)}
                    activeOpacity={0.7}
                  >
                    {song.albumArt ? (
                      <Image
                        source={{ uri: song.albumArt }}
                        style={styles.searchModalAlbumArt}
                      />
                    ) : (
                      <View style={styles.searchModalAlbumPlaceholder}>
                        <Ionicons
                          name="musical-notes"
                          size={24}
                          color="#535353"
                        />
                      </View>
                    )}
                    <View style={styles.searchModalSongInfo}>
                      <ThemedText
                        style={styles.searchModalSongTitle}
                        numberOfLines={1}
                      >
                        {song.title}
                      </ThemedText>
                      <ThemedText
                        style={styles.searchModalSongArtist}
                        numberOfLines={1}
                      >
                        {song.artist}
                      </ThemedText>
                    </View>
                    <Ionicons name="add-circle" size={28} color="#1DB954" />
                  </TouchableOpacity>
                ))
              ) : searchQuery.length > 0 ? (
                <View style={styles.searchModalEmpty}>
                  <Ionicons name="search-outline" size={64} color="#282828" />
                  <ThemedText style={styles.searchModalEmptyText}>
                    No songs found
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.searchModalEmpty}>
                  <Ionicons
                    name="musical-notes-outline"
                    size={64}
                    color="#282828"
                  />
                  <ThemedText style={styles.searchModalEmptyText}>
                    Start typing to search songs
                  </ThemedText>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        )}

        {/* Queue */}
        <View style={styles.queueContainer}>
          <ThemedText type="subtitle" style={styles.queueTitle}>
            UP NEXT
          </ThemedText>
          {songs.filter(
            (s) => s.uri !== currentlyPlaying?.uri && s.uri !== lastPlayedUri
          ).length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="list-outline" size={48} color="#282828" />
              <ThemedText style={styles.emptyText}>
                Queue is empty. Add songs to get started!
              </ThemedText>
            </View>
          ) : (
            <FlatList
              data={songs.filter(
                (s) =>
                  s.uri !== currentlyPlaying?.uri && s.uri !== lastPlayedUri
              )}
              renderItem={({ item, index }) => (
                <AnimatedSongItem song={item} index={index} />
              )}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.queueContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    color: "#888",
    fontSize: 16,
    marginTop: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 18,
    backgroundColor: "rgba(0, 0, 0, 0.98)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  sessionName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  headerButtons: {
    flexDirection: "row",
    gap: 12,
  },
  qrButton: {
    padding: 8,
  },
  headerIcon: {
    padding: 8,
  },
  playerContainer: {
    flex: 1,
    width: "100%",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
  },
  emptyText: {
    marginTop: 20,
    textAlign: "center",
    color: "#535353",
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: -0.2,
  },
  // Playing Indicator Styles
  playingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    width: 16,
    height: 16,
    marginRight: 8,
  },
  playingBar: {
    width: 3,
    height: 12,
    backgroundColor: "#1DB954",
    borderRadius: 2,
  },
  qrOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  qrClose: {
    position: "absolute",
    top: 60,
    right: 16,
    zIndex: 1001,
  },
  qrContainer: {
    alignItems: "center",
    backgroundColor: "#121212",
    padding: 40,
    borderRadius: 12,
    gap: 16,
  },
  qrText: {
    color: "#fff",
    fontSize: 18,
    marginTop: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
    paddingHorizontal: 24,
  },
  endModal: {
    backgroundColor: "#181818",
    borderRadius: 12,
    padding: 32,
    width: "100%",
    maxWidth: 400,
  },
  endModalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
  },
  endModalText: {
    fontSize: 16,
    color: "#b3b3b3",
    marginBottom: 24,
    lineHeight: 24,
  },
  endModalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  endModalCancel: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
  },
  endModalCancelText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  endModalConfirm: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: "#ff4444",
    alignItems: "center",
  },
  endModalConfirmText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  nowPlayingContainer: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 20,
    backgroundColor: "rgba(29, 185, 84, 0.08)",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1.5,
    borderColor: "rgba(29, 185, 84, 0.2)",
    ...Platform.select({
      ios: {
        shadowColor: "#1DB954",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  nowPlayingHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  nowPlayingLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1DB954",
    letterSpacing: 1.5,
  },
  nowPlayingContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  nowPlayingAlbum: {
    width: 88,
    height: 88,
    borderRadius: 8,
    marginRight: 20,
    backgroundColor: "#181818",
    ...Platform.select({
      ios: {
        shadowColor: "#1DB954",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  nowPlayingAlbumPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 8,
    marginRight: 20,
    backgroundColor: "#181818",
    justifyContent: "center",
    alignItems: "center",
  },
  nowPlayingInfo: {
    flex: 1,
  },
  nowPlayingTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  nowPlayingArtist: {
    fontSize: 15,
    fontWeight: "500",
    color: "#b3b3b3",
    letterSpacing: -0.2,
  },
  queueContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  queueTitle: {
    marginBottom: 20,
    marginTop: 8,
    fontSize: 11,
    fontWeight: "800",
    color: "#6a6a6a",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  queueContent: {
    paddingBottom: 120,
  },
  songItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    gap: 14,
  },
  albumCover: {
    width: 56,
    height: 56,
    borderRadius: 6,
    backgroundColor: "#181818",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  albumCoverPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 6,
    backgroundColor: "#181818",
    justifyContent: "center",
    alignItems: "center",
  },
  songInfo: {
    flex: 1,
  },
  songTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  songTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#fff",
    flex: 1,
    marginBottom: 5,
    letterSpacing: -0.2,
  },
  songArtist: {
    fontSize: 13,
    fontWeight: "400",
    color: "#b3b3b3",
    marginBottom: 2,
    letterSpacing: -0.1,
  },
  magicIcon: {
    marginLeft: 4,
  },
  playButton: {
    padding: 4,
  },
  playButtonContainer: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  indexNumber: {
    width: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  indexText: {
    fontSize: 15,
    color: "#6a6a6a",
    fontWeight: "600",
  },
  searchContainer: {
    marginTop: 20,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(18, 18, 18, 0.98)",
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  searchIcon: {
    marginRight: 12,
  },
  searchPlaceholder: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.4)",
    fontWeight: "500",
    letterSpacing: -0.2,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#fff",
    fontWeight: "500",
    letterSpacing: -0.2,
  },
  // Full-Screen Search Modal
  searchModal: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000",
    zIndex: 1000,
  },
  searchModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: "rgba(0, 0, 0, 0.98)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  searchBackButton: {
    padding: 8,
    marginRight: 8,
  },
  searchModalInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchModalInput: {
    flex: 1,
    fontSize: 16,
    color: "#fff",
    fontWeight: "500",
    letterSpacing: -0.2,
  },
  searchModalContent: {
    flex: 1,
  },
  searchModalSongItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  searchModalAlbumArt: {
    width: 64,
    height: 64,
    borderRadius: 8,
    marginRight: 16,
    backgroundColor: "#181818",
  },
  searchModalAlbumPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 8,
    marginRight: 16,
    backgroundColor: "#181818",
    justifyContent: "center",
    alignItems: "center",
  },
  searchModalSongInfo: {
    flex: 1,
    marginRight: 14,
  },
  searchModalSongTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  searchModalSongArtist: {
    fontSize: 15,
    fontWeight: "500",
    color: "#b3b3b3",
    letterSpacing: -0.2,
  },
  searchModalEmpty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 100,
  },
  searchModalEmptyText: {
    marginTop: 20,
    fontSize: 16,
    color: "#535353",
    fontWeight: "500",
    letterSpacing: -0.2,
  },
});
