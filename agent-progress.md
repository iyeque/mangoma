# Agent Mangoma - Progress Log

## Mission: Live Streaming Backend for Google Lyria API

**Date Started:** 2026-03-14
**Status:** In Progress

---

## Phase 1: Understanding & Planning

### Mission Clarification
- Build a WebSocket server to receive audio chunks from a frontend
- Integrate Google Lyria experimental API (`lyria-realtime-exp`) - free tier
- Stream processed audio to YouTube RTMP
- Create preset storage API (JSON configs)
- This is a NEW feature, separate from the existing YouTube automation pipeline

### Architecture Design

```
┌─────────────────┐
│   Frontend      │  (MediaRecorder → WebSocket audio chunks)
│   (browser)     │
└────────┬────────┘
         │ WebSocket (audio binary)
         ▼
┌─────────────────────────────────────────────┐
│      Mangoma Live Streaming Server         │
│  ┌─────────────────────────────────────┐  │
│  │  WebSocket Handler                 │  │
│  │  - Accept audio connections        │  │
│  │  - Buffer/reassemble audio chunks  │  │
│  └──────────────┬──────────────────────┘  │
│                 │                         │
│  ┌──────────────▼──────────────────────┐  │
│  │  Lyria API Client                  │  │
│  │  - Send audio to lyria-realtime-exp│  │
│  │  - Receive processed/streaming     │  │
│  └──────────────┬──────────────────────┘  │
│                 │                         │
│  ┌──────────────▼──────────────────────┐  │
│  │  YouTube RTMP Streamer             │  │
│  │  - Pipe audio to RTMP endpoint     │  │
│  │  - Handle YouTube stream key       │  │
│  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
                  │ RTMP
                  ▼
         ┌─────────────────┐
         │   YouTube       │
         │   Live Stream   │
         └─────────────────┘
```

### Technology Choices
- **WebSocket Server**: TypeScript + `ws` (Node.js)
- **HTTP API**: Express (for preset CRUD and control endpoints)
- **Audio Processing**: FFmpeg for transcoding/re-encoding
- **YouTube RTMP**: FFmpeg child process
- **Lyria API**: `@google/genai` SDK (WebSocket interface)
- **Preset Storage**: JSON files in `presets/` directory
- **Configuration**: YAML + Environment variables (consistent with existing code)
- **Logging**: Winston

### Dependencies
- `@google/genai` — Google GenAI SDK for Lyria
- `ws` — WebSocket server/client
- `express` — HTTP REST API
- `cors` — CORS support
- `dotenv` — Environment variables
- `winston` — Structured logging
- `typescript`, `tsx` — TypeScript toolchain

---

## Phase 2: Design & Specification (Completed)

### Audio Format Decision
- **Input (Browser):** WebM/Opus @ 48kHz stereo (default MediaRecorder)
- **Lyria Processing:** Pass-through WebM/Opus (no conversion)
- **YouTube RTMP Output:** FFmpeg transcodes Opus → AAC @ 48kHz, wraps in FLV with H.264 black video
- **Rationale:** Single conversion point, minimal quality loss, low latency

### Preset Schema
See `live/src/presets_api.ts` for full interface. Key sections:
- `lyria.params` — BPM, mood, genre, intensity, temperature
- `youtube` — streamKey, title, description, tags, privacy, chatEnabled
- `interaction` — chatCommands map, realtimeAdjustments (cooldowns)
- `audio` — sampleRate, channels, outputBitrate

### API & WebSocket Protocol

**HTTP Endpoints:**
- `GET /health`
- `GET /api/presets` (list)
- `GET /api/presets/:id` (load)
- `POST /api/presets` (save)
- `DELETE /api/presets/:id`
- `POST /api/stream/start` (body: `{ presetId }`)
- `POST /api/stream/stop`
- `POST /api/stream/update` (body: partial Lyria params)
- `GET /api/stream/status`

**WebSocket `/live/stream`:**
- Binary: audio chunks (WebM/Opus)
- JSON:
  * `{ "type": "preset", "presetId": "id" }`
  * `{ "type": "update", "bpm": 80, "mood": "energetic" }`
  * `{ "type": "ping" }`
- Outgoing:
  * `{ "type": "connected", "clientId", "preset" }`
  * `{ "type": "preset_loaded", "preset" }`
  * `{ "type": "parameters_updated", "params" }`
  * `{ "type": "pong", "timestamp" }`
  * `{ "type": "error", "message" }`

---

## Implementation Log

### 2026-03-14 18:30 — Setup & Configuration
- Created live/ directory structure
- Wrote `live/package.json`, `tsconfig.json`, `.env.example`
- Implemented `config.ts` for environment loading
- Set up Winston logging in `utils.ts`

### 2026-03-14 19:00 — Core Server
- Implemented `src/server.ts`:
  * Express app with CORS + JSON middleware
  * WebSocketServer on `/live/stream`
  * HTTP routes for presets and streaming control
  * Connection handler: tracks clients, routes binary audio vs JSON control
  * Control message handlers: `preset` (load), `update` (params), `ping`
  * Audio handler: forwards to Lyria client, then to YouTube RTMP if streaming
  * Graceful shutdown on SIGTERM/SIGINT
  * Rich startup banner

### 2026-03-14 19:15 — Supporting Modules
- `src/presets_api.ts` — Full CRUD with file-based storage, includes default values from config
- `src/lyria_client.ts` — Wrapper for `@google/genai` live session; handles connection lifecycle, audio ingestion, parameter updates via text commands
- `src/youtube_rtmp.ts` — FFmpeg child process with stdin piping; manages black video + audio, transcodes to H.264/AAC/FLV; queuing for pre-connection audio

### 2026-03-14 19:30 — Frontend & Docs
- `live/frontend/index.html` — Self-contained test page with:
  * WebSocket connect/disconnect
  * MediaRecorder capture (100ms chunks)
  * Preset selection from API
  * Real-time log view
- `live/README.md` — Complete documentation with quick start, API reference, architecture diagram
- `src/test.ts` — Minimal connectivity test (ping/pong)

### 2026-03-14 19:35 — Defaults & Assets
- `live/presets/default.json` — "Lo-Fi Study Session" preset with BPM=70, mood=chill, genre=lo-fi
- Updated `agent-progress.md` with full implementation log
- Appended memory file `memory/2026-03-14.md` with implementation details

---

## Additional Task: README Documentation Update

- **Completed:** Added comprehensive "🚀 Autonomous Agent Setup" section to root README.md
- Covers: spawning via OpenClaw, memory system, autonomy capabilities, skill extension, collaboration workflow, troubleshooting
- Makes repository self-documenting for future human and agent maintainers

---

## Resources Received

- **Gemini API Key:** `AIzaSyBR0SkNfE83Cn4TdOCkAojE7-zB-hClgTs` (added to local .env, not committed)
- **Language decision:** TypeScript (consistent with existing WebSocket proxy)
- **Architecture:** Single-stream first, multi-tenant later
- **Preset interaction:** Chat commands and real-time parameter adjustments with cooldown

---

## Open Questions (Blocking Testing)

1. **Lyria API real-time parameter format** — The exact text command syntax for changing BPM/mood on-the-fly is assumed (`/set BPM:80 Mood:chill`). May need adjustment.
2. **Audio format compatibility** — Need to verify that Google Lyria accepts raw WebM/Opus chunks directly. If it requires PCM or a different format, we'll need a transcoding step before sending.
3. **YouTube RTMP stability** — FFmpeg command uses a black video placeholder; confirm that YouTube accepts audio-only with static video. Some regions may require true video content.
4. **Chat integration** — YouTube Live Chat API polling not yet implemented; planned for Phase 2.

---

## Next Steps

1. **Install dependencies:**
   ```bash
   cd ~/.openclaw/workspace-mangoma/live
   npm install
   ```

2. **Configure .env:**
   - Add received `GEMINI_API_KEY`
   - Add `YOUTUBE_STREAM_KEY` (when ready to test actual streaming)
   - Verify other defaults (PORT=8080, etc.)

3. **Run dev server:**
   ```bash
   npm run dev
   ```

4. **Open test page:** `http://localhost:8080/frontend/`
   - Connect WebSocket
   - Allow microphone
   - Select "default-lofi-study" preset
   - Start streaming
   - Verify: audio sent, Lyria returns processed audio, FFmpeg starts, RTMP connection established

5. **Monitor logs** for FFmpeg and Lyria connectivity

6. **Test real-time updates:** Send POST `/api/stream/update` with `{ "bpm": 90 }` and verify Lyria responds

7. **Address any API format mismatches** based on observed Lyria behavior

8. **After stable test:** Obtain YouTube stream key, test actual RTMP push to YouTube Studio

---

## Phase 2 & 3 Roadmap

- **YouTube Live Chat API integration** — read chat, parse commands (`!bpm`, `!mood`), enforce cooldown
- **Dashboard UI** — stream stats, viewer count, log tail
- **Multi-tenancy** — per-stream isolation, multiple concurrent presets
- **Authentication** — API key for preset access, WebSocket auth
- **Recording** — save stream to file for later upload

---

**Note:** The existing `backend/` (Python) and `frontend/` (Lit) are separate from this `live/` module. They serve the YouTube *pre-rendered* automation use case. This new live streaming system is parallel but may eventually share preset concepts and configuration.

### 2026-03-17 — Memory Sync (Cron)

- **Memory sync performed**: checked `~/.openclaw/agents/mangoma/memory/` — no new memory files since 2026-03-14.
- **Agent status**: idle (last activity: 2026-03-14, implementation complete, awaiting user testing).
- **Repository state**: Clean working directory; all changes already committed in previous sessions.
- **Next**: User should install dependencies and test the live streaming server.

### 2026-03-18 06:00 — Memory Sync (Cron)

- **Memory sync performed**: checked `~/.openclaw/agents/mangoma/memory/` — still no new memory files since 2026-03-14.
- **Agent status**: idle (unchanged).
- **Repository state**: Clean; no local changes to commit.
- **Action**: No commit required (no changes to push).
