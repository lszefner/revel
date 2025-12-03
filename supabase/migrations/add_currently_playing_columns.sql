-- Add currently playing columns to sessions table for guest sync
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS currently_playing_uri TEXT,
ADD COLUMN IF NOT EXISTS currently_playing_title TEXT,
ADD COLUMN IF NOT EXISTS currently_playing_artist TEXT,
ADD COLUMN IF NOT EXISTS currently_playing_album_art TEXT;

-- Enable realtime for sessions table (if not already enabled)
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;

