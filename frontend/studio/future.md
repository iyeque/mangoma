# Mangoma: Development Roadmap (Studio + Overall)

This document outlines the plan to evolve Mangoma from its current state into a fully automated music production and distribution platform.

**As of 2026-03-18:**
- ✅ **Live Streaming Module** is fully implemented (see [../../docs/LIVE_STREAMING.md](../../docs/LIVE_STREAMING.md))
- ✅ Studio UI is functional for prompt-based music generation and preset export

---

## Focus Areas

### 1. Studio Full Backend Integration

**Goal:** Connect the Studio UI to a stable backend proxy for real-time generation.

**Tasks:**
- Ensure the WebSocket proxy in `backend/src/` (or new endpoint) reliably forwards audio to Lyria.
- Implement proper error handling, reconnection, and status feedback.
- Move all API communication out of the frontend into the backend.

### 2. Batch Rendering Pipeline (Pre-Rendered Videos)

**Goal:** Generate full-length music tracks and combine with AI-generated visuals to create MP4s.

**Tasks:**
- Create a "Render" button in Studio that sends the preset to the backend.
- Backend script stitches multiple Lyria generations into a continuous audio file.
- Integrate with Stable Diffusion (or similar) to generate video frames aligned with audio.
- Use FFmpeg to merge audio + video into final MP4.
- Add YouTube upload integration (YouTube Data API) or save to disk.

### 3. Orchestration & Automation

**Goal:** Automated content creation using the preset library and scheduler.

**Tasks:**
- Build an orchestrator agent (Node.js) that:
  - Selects presets from the library on a schedule.
  - Triggers batch rendering (Section 2) or starts a live stream.
  - Manages uploads and playlist management.
- Add a simple UI or config file for scheduling.
- Implement notifications/logging for job status.

### 4. Enhanced Live Streaming Features

**The live streaming module is functional, but can be extended:**

**Tasks:**
- Implement real YouLive chat polling (currently placeholder).
- Add support for custom chat command prefixes and cooldown per-stream.
- WebSocket binary monitoring (optional audio stream back to dashboard for waveform visualization).
- Stream health metrics (bitrate, dropped frames, Lyria latency).
- Automatic restart on failure (systemd or PM2).

### 5. Quality of Life & Polish

- Better preset management UI (search, tags, favorites).
- Social sharing: one-click stream start with custom title/description.
- Analytics dashboard (view count, watch time).
- Multi-language support for UI and chat commands.

### 6. Security & Scale

- Add authentication for admin APIs (start/stop/update).
- Rate limiting on parameter updates.
- Centralized logging (e.g., Winston + Loki, or cloud).
- Containerization (Docker) and orchestration (Kubernetes) for production.

---

## Architecture Summary

```
┌─────────────────┐     presets     ┌──────────────────┐
│   Studio UI     │ ──────────────▶ │   Backend API    │
│ (frontend/studio)│                │  (backend/src/)  │
└─────────────────┘                 └──────────────────┘
         │                                    │
         │ manual trigger                    │ batch job
         ▼                                    ▼
┌─────────────────┐                 ┌──────────────────┐
│ Presets Library │                 │   Orchestrator   │
│   (JSON files)  │                 │                  │
└─────────────────┘                 └──────────────────┘
                                                 │
                                                 ▼
                                    ┌────────────────────────┐
                                    │   Output Destinations  │
                                    │ • YouTube Live (RTMP)  │
                                    │ • YouTube Videos (Upload)│
                                    └────────────────────────┘
```

The Live Streaming dashboard (`frontend/live/`) directly controls the autonomous live pipeline via `backend/src/live/`.

---

## Milestones

- **M1:** Studio → backend proxy integration (real-time generation works in UI end-to-end)
- **M2:** Batch renderer produces first MP4 with audio+video
- **M3:** Orchestrator runs scheduled jobs autonomously
- **M4:** Live streaming feature-complete (chat commands, reliability)
- **M5:** Deployment to production with monitoring

---

## Contributing

Each major component lives in its own directory; see respective READMEs and docs for details:

- [Live Streaming Guide](../../docs/LIVE_STREAMING.md)
- [API Reference](../../docs/API.md)
- [Overall Architecture](../../ARCHITECTURE.md)
