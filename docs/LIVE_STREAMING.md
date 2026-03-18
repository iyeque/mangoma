# Mangoma Live Streaming Guide

## Overview

Mangoma Live enables autonomous, continuous music generation using Google's Lyria model, streamed directly to YouTube via RTMP. The system is designed for 24/7自动化音乐直播 without requiring user interaction or microphone input.

**Key Features:**
- Continuous AI-generated music from text prompts
- Real-time parameter adjustments via chat commands or API
- Preset-based configuration for quick deployment
- Robust error handling and auto-reconnect
- YouTube RTMP streaming with audio-only (black video placeholder)

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         YouTube Live RTMP                          │
│          (rtmp://a.rtmp.youtube.com/live2/[STREAM_KEY])           │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ FFmpeg (PCM→AAC/FLV)
                               │ + black video (1920x1080 @ 30fps)
┌──────────────────────────────▼─────────────────────────────────────┐
│              YouTubeRTMPStreamer (Node.js/TypeScript)             │
│  • Accepts PCM audio via writeAudio()                             │
│  • Manages FFmpeg process                                          │
│  • Handles queuing and backpressure                               │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ Audio chunks
┌──────────────────────────────▼─────────────────────────────────────┐
│                    LyriaClient (Node.js/TypeScript)               │
│  • Connects to Google Gemini Live Music API                        │
│  • startGeneration(prompt, params) → continuous audio output      │
│  • updateParameters(params) → real-time adjustments               │
│  • onAudioChunk callback → forwards to RTMP streamer              │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ WebSocket control, HTTP API
┌──────────────────────────────▼─────────────────────────────────────┐
│                 Mangoma Live Server (Express + WS)                │
│  • REST API: /api/stream/start, /api/stream/stop, /api/stream/update │
│  • WebSocket: /live/stream (control-only, no audio)              │
│  • Presets management: /api/presets (CRUD)                        │
│  • ChatPoller integration for YouLive chat commands               │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTP requests, WebSocket control
┌──────────────────────────────▼─────────────────────────────────────┐
│                   Frontend Dashboard (Lit/TypeScript)             │
│  • Connect/Disconnect WebSocket                                   │
│  • Start/Stop streaming                                           │
│  • Select presets or enter custom prompts                        │
│  • Real-time parameter sliders (BPM, intensity, mood, genre)     │
│  • Status display and system logs                                │
└────────────────────────────────────────────────────────────────────┘

## Installation & Setup

### Prerequisites
- Node.js 18+
- FFmpeg installed and in PATH
- Google Gemini API key with Lyria access
- YouTube account with Live Streaming enabled

### Environment Configuration

Create a `.env` file in `backend/`:

```env
# Google Gemini API
GEMINI_API_KEY=your_api_key_here
LYRIA_MODEL=lyria-realtime-exp

# Server
PORT=8080
HOST=localhost

# YouTube RTMP
YOUTUBE_RTMP_URL=rtmp://a.rtmp.youtube.com/live2
YOUTUBE_STREAM_KEY=your_stream_key_here

# Audio configuration
AUDIO_SAMPLE_RATE=48000
AUDIO_CHANNELS=2
AUDIO_BITRATE=192k

# Logging
LOG_LEVEL=info
```

### Install Dependencies

```bash
cd backend
npm install
```

### Build and Run

```bash
# Development (with hot-reload)
npm run dev

# Production build
npm run build
npm start
```

## Usage

### 1. Start the Server

```bash
cd backend
npm run dev
```

Server will start on `http://localhost:8080` (or configured port).

### 2. Access Dashboard

Open browser to `http://localhost:8080` → redirects to live control dashboard.

### 3. Start Streaming

**Option A: Use a Preset**
1. Select a preset from the dropdown (e.g., "default-lofi-study")
2. Click "Load Preset"
3. Click "Start Stream"

**Option B: Custom Prompt**
1. Enter a text prompt (e.g., "Continuous synthwave music, 120 BPM, retro atmosphere")
2. Click "Start Custom"

The server will:
- Connect to Lyria
- Begin continuous music generation
- Start FFmpeg and publish to YouTube RTMP
- Enable chat polling (if configured in preset)

### 4. Adjust Parameters in Real-Time

Use the dashboard controls to modify:
- **BPM**: 40-200
- **Intensity**: 0-1
- **Mood**: chill, energetic, focus, nostalgic, happy, melancholic, dark, uplifting
- **Genre**: lo-fi, jazz, ambient, synthwave, electronic, classical, hip-hop, rock

Changes are sent to Lyria immediately via the active session.

## API Reference

See [API.md](./API.md) for complete REST and WebSocket API documentation.

## Presets

Presets are stored as JSON files in `backend/src/live/presets/`. A preset defines:

- **id**: Unique identifier
- **name**: Display name
- **lyria.params**: Default generation parameters
- **youtube**: Stream key, title, description, tags
- **interaction**: Chat commands, realtimeAdjustments, cooldown
- **audio**: Output sample rate, channels, bitrate

### Creating a Preset

```bash
curl -X POST http://localhost:8080/api/presets \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-preset",
    "name": "My Custom Stream",
    "lyria": {
      "params": {
        "bpm": 80,
        "mood": "chill",
        "genre": "ambient",
        "intensity": 0.6
      }
    },
    "youtube": {
      "title": "My Ambient Stream",
      "description": "AI-generated ambient music",
      "privacy": "private"
    },
    "interaction": {
      "realtimeAdjustments": {
        "enabled": true,
        "cooldownSeconds": 60
      }
    }
  }'
```

## Chat Commands (YouLive)

When enabled (via preset or default), the ChatPoller polls YouLive chat and translates commands to parameter updates.

**Supported commands:**
- `!bpm <40-200>` - Change tempo
- `!mood <chill|energetic|focus|...>` - Change mood
- `!genre <lo-fi|jazz|ambient|...>` - Change genre
- `!intensity <0-1>` - Adjust intensity
- `!help` - Show help

**To integrate:** YouLive API credentials need to be added to `ChatPoller.fetchChatMessages()` implementation.

## Troubleshooting

### FFmpeg errors
Ensure FFmpeg is installed: `ffmpeg -version`
Check that required codecs (libx264, aac) are available.

### Lyria connection fails
Verify `GEMINI_API_KEY` is set and valid.
Check that the Lyria model is accessible (`lyria-realtime-exp` or other).

### YouTube stream not appearing
Verify the stream key matches your YouTube Live event.
Ensure YouTube ingest URL is correct (region-specific).
Check that FFmpeg is actually sending data (see logs).

### No audio in dashboard
The dashboard no longer receives audio; it's a control-only interface. Check the actual YouTube stream to verify audio output.

## Deployment

### Docker (recommended)

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --only=production
COPY backend/ .
COPY frontend/live ./../frontend/live
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

Build and run:
```bash
docker build -f Dockerfile -t mangoma-live .
docker run -p 8080:8080 --env-file .env mangoma-live
```

### Manual Production

```bash
cd backend
npm ci --only=production
npm run build
npm start
```

Use a process manager like PM2:
```bash
pm2 start dist/server.js --name mangoma-live
```

### SSL/WSS

For production with secure WebSocket (wss://), terminate SSL at a reverse proxy (nginx, Caddy):
```nginx
server {
    listen 443 ssl;
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## License

MIT
