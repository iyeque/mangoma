# Mangoma: Present Architecture (Studio)

This document describes the current state and architecture of the **Mangoma Studio** — the prompt-based UI for pre-rendered music video generation.

> **Note:** The live streaming module is now a separate, fully implemented system. See:
> - **Live docs:** [../../docs/LIVE_STREAMING.md](../../docs/LIVE_STREAMING.md)
> - **Live dashboard:** `frontend/live/`
> - **Live backend:** `backend/src/live/`

---

## Core Features (Implemented)

### 1. Real-time Music Generation UI
- **Technology:** Lit, TypeScript, CSS.
- **Functionality:** Users can add, remove, and edit multiple text prompts. Each prompt has an associated color and a weight that can be adjusted in real-time using a vertical slider. The visual background of the application changes dynamically based on the weights and colors of the active prompts.
- **Advanced Controls:** A comprehensive settings panel allows for fine-tuning of the music generation process, including parameters like temperature, guidance, BPM, scale, and more. These settings can be toggled via an "Advanced Settings" view.

### 2. Preset Authoring System
- **Functionality:** The "Save Preset" button captures the application's entire state—all prompts with their text and weights, and the complete advanced settings configuration.
- **Output:** This state is displayed in a modal as a well-structured JSON object. The user can copy this JSON or download it as a `.json` file.
- **Purpose:** This feature turns Mangoma into an authoring tool. The generated JSON presets are designed to be consumed by a backend system for automated, "headless" music generation (including the Live Streaming module).

---

## Technical Architecture

### Frontend (Studio)
- **Framework:** [Lit](https://lit.dev/) for creating lightweight, reactive web components (`<prompt-controller>`, `<settings-controller>`, etc.).
- **Language:** TypeScript.
- **Build:** Vite for fast development and bundling.
- **Audio:** The `Web Audio API` is used for real-time audio playback and buffering.

### API Communication
- **Pattern:** Studio frontend communicates with the backend proxy (Express) to securely call Google GenAI.
- **Model:** `lyria-realtime-exp` (experimental).
- **Security:** All API calls are made **through a backend proxy**; the `GEMINI_API_KEY` never touches the browser.

### Backend Proxy (for Studio)
- **Location:** `backend/src/` (being integrated; some endpoints may be WIP)
- **Technology:** Node.js + Express + WebSocket proxy to Google GenAI.

---

## Separation of Concerns

Mangoma now consists of two main front-ends:

| Component | Path | Purpose |
|-----------|------|---------|
| **Studio** | `frontend/studio/` | Interactive prompt blending, weight editing, preset authoring. Outputs presets for automated pipelines. |
| **Live Dashboard** | `frontend/live/` | Control panel for the autonomous live streaming system (start/stop, preset selection, real-time parameter adjustments). |

Corresponding backends:

| Backend | Path | Purpose |
|---------|------|---------|
| **Studio Proxy** | `backend/src/` (pending full integration) | Handles real-time generation requests from Studio UI. |
| **Live Streaming** | `backend/src/live/` | Autonomous continuous generation → YouTube RTMP. No microphone input. |

---

## Current Status

- **Studio UI:** Fully functional for prompt-based music generation and preset export.
- **Live Streaming:** Implemented separately; includes continuous Lyria generation, YouTube RTMP, chat command handling, and a dashboard. See [../../docs/LIVE_STREAMING.md](../../docs/LIVE_STREAMING.md).
- **Preset API:** Shared format used by both pipelines. Backend presets storage available at `backend/src/live/presets_api.ts` (will be generalized).

---

## Next Steps for Studio

- Integrate Studio fully with the backend proxy for seamless real-time generation.
- Implement batch rendering pipeline for video output (generate full tracks, combine with Stable Diffusion visuals).
- Add video composition controls and YouTube upload integration.

These items are part of the overall roadmap documented in `future.md`.

---

## See Also

- [Overall Architecture](../ARCHITECTURE.md)
- [Live Streaming Guide ../../docs/LIVE_STREAMING.md](../../docs/LIVE_STREAMING.md)
- [API Reference ../../docs/API.md](../../docs/API.md)
- [Roadmap (Studio + overall)](./future.md)
