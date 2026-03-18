# Mangoma Architecture

## System Overview

Mangoma is an AI-powered music generation platform with **two complementary pipelines**:

### 1. Pre-Rendered Video Pipeline (`backend/src/` and `frontend/studio/`)

**Purpose:** Generate complete music videos (audio + visuals) for scheduled YouTube uploads.

**Stack:**
- **Backend:** Node.js + Express + FastAPI (Python) - *Note: Python backend being integrated*
- **Frontend:** TypeScript + Lit (`frontend/studio/`)
- **AI:** Google Lyria (music) + Stable Diffusion (visuals)
- **Output:** MP4 video files for upload

**Flow:**
```
User → Studio UI (prompts/weights) → Preset export → Offline rendering → MP4 → YouTube upload
```

### 2. Live Streaming Module (`backend/src/live/` and `frontend/live/`)

**Purpose:** 24/7 autonomous music generation streamed live to YouTube.

**Stack:**
- **Backend:** Node.js + Express + WebSocket (`backend/src/live/`)
- **Frontend:** Simple HTML/JS dashboard (`frontend/live/`)
- **AI:** Google Lyria continuous generation
- **Output:** RTMP stream to YouTube (audio + black video placeholder)

**Flow:**
```
Text prompt → Lyria API (autonomous) → FFmpeg (AAC/FLV) → YouTube RTMP
       ↑
Chat commands (!bpm, !mood, !genre) adjust parameters in real-time
```

---

## Unified Directory Structure

```
mangoma/
├── backend/
│   ├── src/
│   │   ├── proxy/           # Existing WebSocket proxy for pre-rendered pipeline
│   │   └── live/            # Live streaming backend
│   │       ├── server.ts
│   │       ├── lyria_client.ts
│   │       ├── youtube_rtmp.ts
│   │       ├── chat_poller.ts
│   │       ├── presets_api.ts
│   │       ├── config.ts
│   │       ├── utils.ts
│   │       └── presets/     # Preset JSON files
│   ├── package.json
│   └── ...
├── frontend/
│   ├── studio/              # Prompt-based generative UI (pre-rendered)
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── utils.ts
│   │   ├── present.md
│   │   ├── future.md
│   │   ├── package.json
│   │   └── ...
│   └── live/                # Live stream control dashboard
│       └── index.html
├── docs/
│   ├── LIVE_STREAMING.md    # Comprehensive live streaming guide
│   └── API.md               # Full API reference
├── memory/                  # Agent memory logs (daily)
├── .env.example             # Environment template (backend)
├── README.md                # Project overview and quick start
├── ARCHITECTURE.md          # This file
├── CONTRIBUTING.md          # Contribution guidelines
└── AGENTS.md                # Agent operation manual

DEPRECATED (removed):
- mangoma/live/              # Has been redistributed into backend/ and frontend/
```

---

## Key Differences

| Aspect | Pre-Rendered (Studio) | Live Streaming |
|--------|----------------------|----------------|
| **Latency** | Minutes-hours (batch) | Real-time (<1s) |
| **Output** | MP4 files (video+audio) | RTMP stream (audio + black video) |
| **Interaction** | Prompt editing, weights | Chat commands, parameter sliders |
| **AI Usage** | Single generations | Continuous autonomous loop |
| **FFmpeg** | Video rendering | Audio-to-RTMP pipeline |
| **Use Case** | Scheduled uploads | 24/7 automated streams |
| **Frontend** | TypeScript/Lit SPA | Simple control HTML |

---

## Data Flow

### Live Streaming Pipeline

1. **Start Request** → User selects preset or enters custom prompt on dashboard
2. **Server initiates** → `/api/stream/start` loads preset, creates LyriaClient, starts YouTubeRTMPStreamer
3. **Lyria Connection** → `LyriaClient.connect()` establishes WebSocket to Google GenAI
4. **Autonomous Generation** → `startGeneration(prompt, params)` begins continuous audio streaming
5. **Audio Pipeline** → Lyria audio chunks → YouTubeRTMPStreamer.writeAudio() → FFmpeg stdin → YouTube RTMP
6. **Control Loop** → WebSocket (dashboard) / REST API → parameter updates → `updateParameters()` → Lyria
7. **Chat Interaction** → ChatPoller polls YouLive → translates commands → parameter updates

### Pre-Rendered Pipeline

1. **Preset Authoring** → User creates prompts and weights in Studio UI
2. **Preset Export** → JSON saved to backend
3. **Scheduled Job** → Orchestrator triggers generator script
4. **Lyria Generations** → Script calls Lyria multiple times to create full track
5. **Visuals** → Stable Diffusion generates corresponding frames
6. **Composition** → FFmpeg merges audio + visuals into MP4
7. **Upload** → YouTube API publishes video

---

## Integration Points

- **Shared:** Google Lyria API, preset JSON schema, configuration patterns
- **Backend:** Separate Express servers (can be monolith or microservices)
- **Frontend:** Completely separate dashboards, can be served from same domain

---

## Agent Operation

Mangoma runs as an autonomous OpenClaw agent responsible for:

- Self-maintenance (git operations, commit/push)
- Code refactoring (e.g., continuous generation migration)
- Memory persistence (`memory/YYYY-MM-DD.md`, `MEMORY.md`)
- Documentation upkeep (`ARCHITECTURE.md`, `docs/`)
- Repository organization (directory restructuring)

The agent follows the **Mangoma** identity defined in `AGENTS.md`.

See `README.md` for setup and deployment instructions.
