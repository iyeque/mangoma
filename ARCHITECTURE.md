# Mangoma Architecture

## System Overview

Mangoma is an AI-powered music generation platform with **two distinct pipelines**:

1. **Pre-Rendered Video Pipeline** (`src/`, `backend/`, `frontend/`) - Generates music videos offline
2. **Live Streaming Module** (`live/`) - Real-time YouTube RTMP streaming

---

## Pipeline 1: Pre-Rendered Video (Active)

**Purpose:** Generate complete music videos (audio + visuals) for YouTube upload.

**Stack:**
- **Backend:** Python + FastAPI (`backend/src/`)
- **Frontend:** TypeScript + Lit (`frontend/`)
- **AI:** Google Lyria (`lyria-realtime-exp`) + Stable Diffusion
- **Output:** MP4 video files ready for upload

**Flow:**
```
User Request → Lyria API (audio) → Stable Diffusion (frames) → FFmpeg (merge) → MP4 output
```

**Use Case:** Scheduled content, pre-produced playlists, high-quality rendered videos.

---

## Pipeline 2: Live Streaming (In Development)

**Purpose:** Real-time audio streaming to YouTube Live.

**Stack:**
- **Server:** Node.js + TypeScript + Express + WebSocket (`live/src/`)
- **Frontend:** Browser MediaRecorder (`live/frontend/`)
- **AI:** Google Lyria (`lyria-realtime-exp`)
- **Output:** RTMP stream to YouTube

**Flow:**
```
Browser Mic → WebSocket → Lyria API (enhanced audio) → FFmpeg (AAC/FLV) → YouTube RTMP
```

**Use Case:** 24/7 lo-fi streams, interactive live sessions, real-time audience requests.

---

## Directory Structure

```
mangoma/
├── backend/              # Pre-rendered pipeline (Python/FastAPI)
│   └── src/
├── frontend/             # Pre-rendered pipeline UI (TypeScript/Lit)
├── live/                 # Live streaming module (Node.js/TypeScript)
│   ├── src/
│   ├── frontend/
│   └── presets/
├── config/               # Shared configuration
├── templates/            # Video templates
├── output/               # Generated content (gitignored)
├── memory/               # Agent memory logs
├── README.md             # Quick start
├── ARCHITECTURE.md       # This file
├── CONTRIBUTING.md       # Contribution guidelines
└── IMPLEMENTATION_PLAN.md # Roadmap
```

---

## Key Differences

| Aspect | Pre-Rendered | Live Streaming |
|--------|-------------|----------------|
| **Latency** | Minutes-hours (batch) | Real-time (<1s) |
| **Output** | MP4 files | RTMP stream |
| **Interaction** | None (pre-generated) | Chat commands, live adjustments |
| **Complexity** | High (video generation) | Medium (audio only + black video) |
| **Cost** | Higher (compute-intensive) | Lower (streaming only) |

---

## Integration Points

- **Shared:** Google Lyria API, preset configuration format
- **Separate:** Rendering engines, output formats, deployment

---

## Agent Integration

Mangoma is an **autonomous OpenClaw agent** capable of:
- Self-maintenance (git, tests, memory sync)
- Skill extension (edit AGENTS.md, TOOLS.md)
- Repo organization (this architecture doc was agent-generated)

See `README.md` for agent spawning instructions.
