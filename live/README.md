# Mangoma Live Streaming

Real-time audio streaming using Google Lyria experimental API → YouTube RTMP.

## Quick Start

1. **Install dependencies:**
   ```bash
   cd live
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env: add GEMINI_API_KEY and YOUTUBE_STREAM_KEY
   ```

3. **Build and run:**
   ```bash
   npm run dev
   ```

   Server starts on `http://localhost:8080`

4. **Open test page:**
   Navigate to `http://localhost:8080/frontend/`

5. **Connect and stream:**
   - Click **Connect** to establish WebSocket
   - Click **Start Streaming** (will request microphone)
   - Select a preset (or use default)
   - Speak/play audio into mic → processed by Lyria → streamed to YouTube

## API Endpoints

- `GET /health` — Health check
- `GET /api/presets` — List all presets
- `GET /api/presets/:id` — Load preset
- `POST /api/presets` — Save preset (body: preset JSON)
- `DELETE /api/presets/:id` — Delete preset
- `POST /api/stream/start` — Start streaming with preset `{ presetId }`
- `POST /api/stream/stop` — Stop streaming
- `POST /api/stream/update` — Update parameters in real-time `{ bpm?, mood?, genre?, intensity? }`
- `GET /api/stream/status` — Get current streaming status

## WebSocket: `/live/stream`

### Incoming Messages (from client)

**Binary:** Raw audio chunks (WebM/Opus or PCM 16-bit)

**JSON control:**
```json
{ "type": "preset", "presetId": "my-preset" }
{ "type": "update", "bpm": 80, "mood": "energetic" }
{ "type": "ping" }
```

### Outgoing Messages (to client)

```json
{ "type": "connected", "clientId": "...", "preset": "..." }
{ "type": "preset_loaded", "preset": "my-preset" }
{ "type": "parameters_updated", "params": {...} }
{ "type": "pong", "timestamp": 12345 }
{ "type": "error", "message": "..." }
```

## Preset Schema

See `live/src/presets_api.ts` for full TypeScript interface.

Key fields:

```json
{
  "id": "unique-id",
  "name": "Display Name",
  "lyria": {
    "params": {
      "bpm": 70,
      "mood": "chill",
      "genre": "lo-fi",
      "intensity": 0.7
    }
  },
  "youtube": {
    "streamKey": "your-stream-key",
    "title": "Live Stream Title",
    "description": "...",
    "tags": ["lofi", "study"],
    "privacy": "private",
    "chatEnabled": true
  },
  "interaction": {
    "chatCommands": {
      "!bpm": "Change BPM",
      "!mood": "Change mood"
    },
    "realtimeAdjustments": {
      "enabled": true,
      "cooldownSeconds": 300
    }
  }
}
```

## Architecture

```
┌─────────────┐
│ Frontend    │ (MediaRecorder → WebM/Opus)
│ (browser)   │
└─────┬───────┘
      │ WebSocket (binary audio + JSON control)
      ▼
┌─────────────────┐
│ Server          │ (Node.js + ws)
│ - WebSocket     │
│ - Lyria client  │ → Google Lyria API
│ - YouTube RTMP  │ → FFmpeg → YouTube
│ - Presets API   │
└─────────────────┘
```

## Audio Format Pipeline

1. Browser: `MediaRecorder` → WebM/Opus @ 48kHz stereo
2. Server: Forwards to Lyria (no conversion)
3. Lyria: Processes and returns enhanced audio (WebM/Opus)
4. Server: FFmpeg transcodes Opus → AAC, wraps in FLV with black video
5. YouTube RTMP: H.264 video + AAC audio

**Why keep WebM/Opus?** Opus is superior quality and already what MediaRecorder produces. Single conversion to AAC at RTMP output is optimal.

## Development

Add new presets in `presets/` directory as JSON files. The server auto-loads them.

To integrate your own frontend, connect to `/live/stream` WebSocket and send audio binary chunks.

## Notes

- This is **experimental** and uses the free tier of Google Lyria
- YouTube RTMP requires a **stream key** from YouTube Studio
- For multi-tenant support, multiple server instances or stream isolation will be needed later
- Chat moderation and live interaction via YouTube Data API not yet implemented
