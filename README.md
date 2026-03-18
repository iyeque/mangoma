# Mangoma - AI Music Studio

Mangoma is an AI-powered music generation platform with two complementary workflows:

1. **Studio** — Interactive prompt-based music creation for pre-rendered video generation
2. **Live** — Autonomous 24/7 streaming directly to YouTube using continuous Lyria generation

## Quick Start

Choose the pipeline you want to work with:

### Live Streaming (24/7 Autonomous)

The live streaming module generates continuous music without microphone input, streaming directly to YouTube.

**Setup:**

```bash
cd backend
npm install
cp .env.example .env
# Edit .env: set GEMINI_API_KEY, YOUTUBE_STREAM_KEY, etc.
npm run dev
```

Then open `http://localhost:8080` to access the Live Control Dashboard.

See [docs/LIVE_STREAMING.md](./docs/LIVE_STREAMING.md) for complete guide.

### Studio (Pre-Rendered Videos)

The studio app is an interactive UI for authoring presets and generating music videos offline.

**Setup:**

```bash
# Backend (proxy)
cd backend
npm install
cp .env.example .env  # set GEMINI_API_KEY
npm run dev

# Frontend (in another terminal)
cd frontend/studio
npm install
npm run dev
```

Open `http://localhost:5173` (or the Vite dev server URL) for the Studio UI.

The Studio lets you create prompt blends, adjust weights, fine-tune parameters, and export presets for automated rendering.

---

## Project Structure

```
mangoma/
├── backend/
│   ├── src/
│   │   ├── proxy/           # WebSocket proxy for Studio (legacy, being integrated)
│   │   └── live/            # Live streaming backend
│   │       ├── server.ts
│   │       ├── lyria_client.ts
│   │       ├── youtube_rtmp.ts
│   │       ├── chat_poller.ts
│   │       ├── presets_api.ts
│   │       └── presets/
│   └── package.json
├── frontend/
│   ├── studio/              # Prompt-based UI (pre-rendered pipeline)
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── present.md
│   │   ├── future.md
│   │   └── package.json
│   └── live/                # Live stream control dashboard
│       └── index.html
├── docs/
│   ├── LIVE_STREAMING.md
│   └── API.md
├── memory/                  # Agent logs (gitignored)
├── ARCHITECTURE.md          # System architecture
├── AGENTS.md                # Agent manual
├── CONTRIBUTING.md          # How to contribute
├── README.md                # This file
└── .env.example             # Environment template for backend
```

---

## Technologies

- **AI:** Google GenAI (Lyria model)
- **Backend:** Node.js, Express, WebSocket (`ws`), FFmpeg
- **Frontend:** Lit, TypeScript, Vite, Web Audio API
- **Streaming:** YouTube Live via RTMP
- **Build/Dev:** tsx, TypeScript

---

## Configuration

Live streaming backend uses environment variables:

```env
# Google Gemini API
GEMINI_API_KEY=your_key
LYRIA_MODEL=lyria-realtime-exp

# Server
PORT=8080
HOST=localhost

# YouTube RTMP
YOUTUBE_RTMP_URL=rtmp://a.rtmp.youtube.com/live2
YOUTUBE_STREAM_KEY=your_stream_key

# Audio
AUDIO_SAMPLE_RATE=48000
AUDIO_CHANNELS=2
AUDIO_BITRATE=192k

# Logging
LOG_LEVEL=info
```

---

## Development Hints

- **Live backend watch mode:** `cd backend && npm run dev`
- **Studio frontend:** `cd frontend/studio && npm run dev`
- **Build live backend:** `cd backend && npm run build` (outputs to `dist/`)
- **Run tests (connectivity):** `cd backend && npm run test`

---

## Documentation

- [Live Streaming Guide](./docs/LIVE_STREAMING.md)
- [API Reference](./docs/API.md)
- [Architecture](./ARCHITECTURE.md)
- [Agent Operations](./AGENTS.md)
- [Studio Roadmap](./frontend/studio/future.md)
- [Studio Current State](./frontend/studio/present.md)

---

## License

MIT
