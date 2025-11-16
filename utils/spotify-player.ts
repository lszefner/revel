/**
 * Spotify Web Playback SDK utilities
 * https://developer.spotify.com/documentation/web-playback-sdk
 */

export interface SpotifyTrack {
  uri: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
}

export interface PlaybackState {
  paused: boolean;
  position: number;
  duration: number;
  track: SpotifyTrack | null;
}

/**
 * Initialize Spotify Web Playback SDK
 * This is called from the WebView component
 */
export function getWebPlayerHTML(
  accessToken: string,
  deviceName: string = "Revel Player"
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Spotify Player</title>
      <script src="https://sdk.scdn.co/spotify-player.js"></script>
      <style>
        body {
          margin: 0;
          padding: 0;
          background: #000;
          color: #fff;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .player {
          width: 100%;
          max-width: 400px;
          padding: 20px;
        }
        .album-art {
          width: 100%;
          aspect-ratio: 1;
          background: #333;
          margin-bottom: 20px;
          border-radius: 8px;
          object-fit: cover;
        }
        .track-info {
          text-align: center;
          margin-bottom: 20px;
        }
        .track-name {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 8px;
        }
        .artist-name {
          font-size: 18px;
          opacity: 0.7;
        }
        .controls {
          display: flex;
          justify-content: center;
          gap: 20px;
          margin-bottom: 20px;
        }
        button {
          background: #1DB954;
          border: none;
          color: white;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          font-size: 24px;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .progress {
          width: 100%;
          height: 4px;
          background: #333;
          border-radius: 2px;
          overflow: hidden;
        }
        .progress-bar {
          height: 100%;
          background: #1DB954;
          width: 0%;
          transition: width 0.1s;
        }
        .status {
          text-align: center;
          margin-top: 20px;
          opacity: 0.7;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="player">
        <img id="albumArt" class="album-art" src="" alt="Album Art">
        <div class="track-info">
          <div id="trackName" class="track-name">Ready to play</div>
          <div id="artistName" class="artist-name">Connect and start playing</div>
        </div>
        <div class="controls">
          <button id="prevBtn" onclick="previous()">⏮</button>
          <button id="playBtn" onclick="togglePlay()">▶</button>
          <button id="nextBtn" onclick="next()">⏭</button>
        </div>
        <div class="progress">
          <div id="progressBar" class="progress-bar"></div>
        </div>
        <div id="status" class="status">Initializing...</div>
      </div>

      <script>
        let player;
        let deviceId;
        let currentState;

        function sendMessage(type, data) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...data }));
          }
        }

        function log(message) {
          console.log(message);
          sendMessage('LOG', { message });
        }

        // Check if SDK loaded
        document.addEventListener('DOMContentLoaded', () => {
          log('📄 DOM loaded, waiting for Spotify SDK...');
          
          // Timeout check for SDK
          setTimeout(() => {
            if (!window.Spotify) {
              log('❌ Spotify SDK failed to load after 10 seconds');
              sendMessage('PLAYER_ERROR', { error: 'Spotify SDK failed to load. Check internet connection.' });
            }
          }, 10000);
        });

        window.onSpotifyWebPlaybackSDKReady = () => {
          log('🎵 Spotify SDK loaded successfully');
          log('🔑 Token first 20 chars: ${accessToken.substring(0, 20)}...');
          
          try {
            player = new Spotify.Player({
              name: '${deviceName}',
              getOAuthToken: cb => { 
                log('🔑 getOAuthToken called');
                cb('${accessToken}'); 
              },
              volume: 0.8
            });

            log('✅ Spotify.Player instance created');
          } catch (err) {
            log('❌ Failed to create Spotify.Player: ' + err.message);
            sendMessage('PLAYER_ERROR', { error: 'Failed to create player: ' + err.message });
            return;
          }

          // Ready
          player.addListener('ready', ({ device_id }) => {
            log('✅ Ready with Device ID: ' + device_id);
            deviceId = device_id;
            document.getElementById('status').textContent = 'Ready to play';
            
            // Transfer playback to this device immediately when ready
            log('🔄 Auto-transferring playback to Web Player...');
            fetch('https://api.spotify.com/v1/me/player', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ${accessToken}'
              },
              body: JSON.stringify({
                device_ids: [device_id],
                play: false
              })
            }).then(response => {
              if (response.ok || response.status === 204) {
                log('✅ Playback transferred to Web Player');
              } else {
                log('⚠️ Transfer response: ' + response.status);
              }
            }).catch(err => {
              log('⚠️ Transfer error (non-critical): ' + err.message);
            });
            
            sendMessage('PLAYER_READY', { deviceId: device_id });
          });

          // Not Ready
          player.addListener('not_ready', ({ device_id }) => {
            log('❌ Device ID has gone offline: ' + device_id);
            document.getElementById('status').textContent = 'Player offline';
          });

          // Initialization error
          player.addListener('initialization_error', ({ message }) => {
            log('❌ Initialization error: ' + message);
            document.getElementById('status').textContent = 'Error: ' + message;
            sendMessage('PLAYER_ERROR', { error: 'Initialization error: ' + message });
          });

          // Authentication error
          player.addListener('authentication_error', ({ message }) => {
            log('❌ Authentication error: ' + message);
            document.getElementById('status').textContent = 'Auth error: ' + message;
            sendMessage('PLAYER_ERROR', { error: 'Authentication error: ' + message });
          });

          // Account error
          player.addListener('account_error', ({ message }) => {
            log('❌ Account error (Premium required): ' + message);
            document.getElementById('status').textContent = 'Premium required';
            sendMessage('PLAYER_ERROR', { error: 'Spotify Premium required: ' + message });
          });

          // Playback error
          player.addListener('playback_error', ({ message }) => {
            log('❌ Playback error: ' + message);
            document.getElementById('status').textContent = 'Playback error';
            sendMessage('PLAYER_ERROR', { error: 'Playback error: ' + message });
          });

          // State changed
          player.addListener('player_state_changed', state => {
            if (!state) return;

            currentState = state;
            updateUI(state);
            sendMessage('PLAYBACK_STATE', {
              state: {
                paused: state.paused,
                position: state.position,
                duration: state.duration,
                track: state.track_window.current_track
              }
            });
          });

          // Connect to the player
          log('🔌 Connecting to Spotify...');
          player.connect().then(success => {
            if (success) {
              log('✅ Web Playback SDK connected!');
            } else {
              log('❌ Failed to connect Web Playback SDK');
              sendMessage('PLAYER_ERROR', { error: 'Failed to connect to Spotify. Make sure Spotify app is open and you are logged in.' });
            }
          }).catch(err => {
            log('❌ Connection error: ' + err.message);
            sendMessage('PLAYER_ERROR', { error: 'Connection error: ' + err.message });
          });
        };

        // Fallback if SDK never loads
        setTimeout(() => {
          if (!window.onSpotifyWebPlaybackSDKReady.called) {
            log('⚠️ Spotify SDK ready callback not triggered yet');
          }
        }, 5000);

        function updateUI(state) {
          const track = state.track_window.current_track;
          
          document.getElementById('trackName').textContent = track.name;
          document.getElementById('artistName').textContent = track.artists.map(a => a.name).join(', ');
          document.getElementById('albumArt').src = track.album.images[0].url;
          document.getElementById('playBtn').textContent = state.paused ? '▶' : '⏸';
          
          const progress = (state.position / state.duration) * 100;
          document.getElementById('progressBar').style.width = progress + '%';
        }

        function togglePlay() {
          player.togglePlay();
        }

        function next() {
          player.nextTrack();
        }

        function previous() {
          player.previousTrack();
        }

        // Listen for messages from React Native
        window.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            handleCommand(data);
          } catch (e) {
            console.error('Error parsing message:', e);
          }
        });

        // Also listen for document messages (Android)
        document.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            handleCommand(data);
          } catch (e) {
            console.error('Error parsing message:', e);
          }
        });

        function handleCommand(data) {
          log('📨 Received command: ' + JSON.stringify(data));
          
          if (!data || !data.type) {
            log('❌ Invalid command data');
            return;
          }

          switch(data.type) {
            case 'PLAY_TRACK':
              if (!data.uri) {
                log('❌ PLAY_TRACK command missing URI');
                sendMessage('PLAYER_ERROR', { error: 'No URI provided in PLAY_TRACK command' });
                return;
              }
              playTrack(data.uri);
              break;
            case 'PLAY':
              log('▶️ Resuming playback');
              player.resume();
              break;
            case 'PAUSE':
              log('⏸️ Pausing playback');
              player.pause();
              break;
            case 'NEXT':
              log('⏭️ Next track');
              player.nextTrack();
              break;
            case 'PREVIOUS':
              log('⏮️ Previous track');
              player.previousTrack();
              break;
            case 'SEEK':
              log('⏩ Seeking to: ' + data.position);
              player.seek(data.position);
              break;
            default:
              log('⚠️ Unknown command type: ' + data.type);
          }
        }

        // Make handleCommand available globally for injected scripts
        window.handleCommand = handleCommand;

        async function playTrack(uri) {
          log('🎵 playTrack called with URI: ' + uri);
          
          if (!deviceId) {
            const errorMsg = 'No device ID - player not ready yet';
            log('❌ ' + errorMsg);
            sendMessage('PLAYER_ERROR', { error: errorMsg });
            return;
          }

          if (!uri) {
            const errorMsg = 'No URI provided';
            log('❌ ' + errorMsg);
            sendMessage('PLAYER_ERROR', { error: errorMsg });
            return;
          }

          log('🔑 Using device ID: ' + deviceId);
          log('🎵 Playing URI: ' + uri);

          try {
            // Step 1: Transfer playback to this device first
            log('🔄 Transferring playback to Web Player device...');
            const transferResponse = await fetch('https://api.spotify.com/v1/me/player', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ${accessToken}'
              },
              body: JSON.stringify({
                device_ids: [deviceId],
                play: false // Don't auto-play, we'll play the track next
              })
            });

            log('📥 Transfer response status: ' + transferResponse.status);

            if (!transferResponse.ok && transferResponse.status !== 204) {
              const transferError = await transferResponse.text();
              log('⚠️ Transfer warning: ' + transferResponse.status + ' - ' + transferError);
              // Continue anyway - might already be on this device
            } else {
              log('✅ Playback transferred to Web Player');
            }

            // Step 2: Wait a bit for transfer to complete
            await new Promise(resolve => setTimeout(resolve, 500));

            // Step 3: Now play the track
            const url = \`https://api.spotify.com/v1/me/player/play?device_id=\${deviceId}\`;
            log('📡 Calling play: ' + url);
            
            const response = await fetch(url, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ${accessToken}'
              },
              body: JSON.stringify({
                uris: [uri]
              })
            });

            log('📥 Play response status: ' + response.status);

            if (!response.ok) {
              const errorText = await response.text();
              const errorMsg = \`Failed to play track: \${response.status} - \${errorText}\`;
              log('❌ ' + errorMsg);
              sendMessage('PLAYER_ERROR', { error: errorMsg });
              
              // Try to get more details
              try {
                const errorData = JSON.parse(errorText);
                log('❌ Error details: ' + JSON.stringify(errorData));
              } catch (e) {
                // Not JSON, that's fine
              }
            } else {
              log('✅ Track play request successful');
            }
          } catch (error) {
            const errorMsg = \`Error playing track: \${error.message || error}\`;
            log('❌ ' + errorMsg);
            sendMessage('PLAYER_ERROR', { error: errorMsg });
          }
        }

        // Get device ID
        window.getDeviceId = () => deviceId;
      </script>
    </body>
    </html>
  `;
}

/**
 * Play a track using the Web Playback SDK
 */
export async function playTrack(
  accessToken: string,
  deviceId: string,
  uri: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          uris: [uri],
        }),
      }
    );

    return response.ok;
  } catch (error) {
    console.error("Error playing track:", error);
    return false;
  }
}

/**
 * Add track to queue
 */
export async function addToQueue(
  accessToken: string,
  uri: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(
        uri
      )}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    return response.ok;
  } catch (error) {
    console.error("Error adding to queue:", error);
    return false;
  }
}

/**
 * Clear Spotify queue and stop playback
 * Handles repeat mode, shuffle, and playlist contexts to ensure a clean start
 * Uses timeout protection to prevent blocking the app
 */
export async function clearQueueAndStop(accessToken: string): Promise<boolean> {
  // Wrap entire function in timeout to prevent hanging
  const timeoutPromise = new Promise<boolean>((resolve) => {
    setTimeout(() => {
      console.warn("⏱️ Queue clear operation timed out after 10 seconds");
      resolve(true); // Continue anyway
    }, 10000); // 10 second timeout
  });

  const clearPromise = (async () => {
    try {
      console.log("🧹 Starting queue clear...");

      // Step 1: Get active device (with timeout)
      let deviceId: string | null = null;
      try {
        const devicesResponse = await Promise.race([
          fetch("https://api.spotify.com/v1/me/player/devices", {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          new Promise<Response>((_, reject) =>
            setTimeout(() => reject(new Error("Device fetch timeout")), 3000)
          ),
        ]);

        if (devicesResponse.ok) {
          const devicesData = await devicesResponse.json();
          const activeDevice = devicesData.devices?.find(
            (d: any) => d.is_active === true
          );
          deviceId = activeDevice?.id || null;
          console.log("🎧 Active device:", deviceId ? "Found" : "None");
        }
      } catch (error) {
        console.warn("⚠️ Could not get devices:", error);
      }

      // Step 2: Disable repeat mode (critical for playlists on repeat)
      try {
        await fetch("https://api.spotify.com/v1/me/player/repeat?state=off", {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        console.log("✅ Repeat mode disabled");
      } catch (error) {
        console.warn("⚠️ Could not disable repeat:", error);
      }

      // Step 3: Disable shuffle mode
      try {
        await fetch(
          "https://api.spotify.com/v1/me/player/shuffle?state=false",
          {
            method: "PUT",
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        console.log("✅ Shuffle disabled");
      } catch (error) {
        console.warn("⚠️ Could not disable shuffle:", error);
      }

      // Step 4: Pause playback
      try {
        await fetch("https://api.spotify.com/v1/me/player/pause", {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        console.log("✅ Playback paused");
      } catch (error) {
        console.warn("⚠️ Could not pause playback:", error);
      }

      // Step 5: Skip tracks to clear queue (limited to 10 tracks max)
      // This is a best-effort approach - if it fails, the app continues
      if (deviceId) {
        try {
          let skippedCount = 0;
          const maxSkips = 10; // Reduced from 50 to prevent long operations

          for (let i = 0; i < maxSkips; i++) {
            const skipResponse = await Promise.race([
              fetch("https://api.spotify.com/v1/me/player/next", {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}` },
              }),
              new Promise<Response>((_, reject) =>
                setTimeout(() => reject(new Error("Skip timeout")), 1000)
              ),
            ]);

            // If we get 404, there's no active device or no more tracks
            if (skipResponse.status === 404) {
              console.log("ℹ️ No more tracks to skip");
              break;
            }

            skippedCount++;
            // Small delay between skips
            await new Promise((resolve) => setTimeout(resolve, 50));
          }

          console.log(`✅ Skipped ${skippedCount} tracks`);
        } catch (error) {
          console.warn("⚠️ Could not skip tracks:", error);
          // Continue anyway - not critical
        }
      }

      console.log("✅ Queue clear completed");
      return true;
    } catch (error) {
      console.error("❌ Error clearing queue:", error);
      // Always return true - don't block the app
      return true;
    }
  })();

  // Return whichever completes first: clear operation or timeout
  return Promise.race([clearPromise, timeoutPromise]);
}

/**
 * Search for tracks
 */
export async function searchTracks(
  accessToken: string,
  query: string,
  limit: number = 10
) {
  try {
    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(
        query
      )}&type=track&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Search failed");
    }

    const data = await response.json();
    return data.tracks.items;
  } catch (error) {
    console.error("Error searching tracks:", error);
    return [];
  }
}
