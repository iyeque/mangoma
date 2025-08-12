# Mangoma: Present Architecture

This document describes the current state and architecture of the Mangoma application, a creative tool for real-time generative music.

Mangoma is a web application with a **frontend and a backend proxy** built with modern web technologies. It serves as an interactive user interface for the experimental Google Lyria model, allowing for both live creative expression and the authoring of configurations for automated systems.

---

## Core Features (Implemented)

### 1. Real-time Music Generation UI
- **Technology:** Lit, TypeScript, CSS.
- **Functionality:** Users can add, remove, and edit multiple text prompts. Each prompt has an associated color and a weight that can be adjusted in real-time using a vertical slider. The visual background of the application changes dynamically based on the weights and colors of the active prompts.
- **Advanced Controls:** A comprehensive settings panel allows for fine-tuning of the music generation process, including parameters like temperature, guidance, BPM, scale, and more. These settings can be toggled via an "Advanced Settings" view.

### 2. Preset Authoring System
- **Functionality:** The "Save Preset" button captures the application's entire state—all prompts with their text and weights, and the complete advanced settings configuration.
- **Output:** This state is displayed in a modal as a well-structured JSON object. The user can copy this JSON or download it as a `.json` file.
- **Purpose:** This feature turns Mangoma into an authoring tool. The generated JSON presets are designed to be consumed by a backend system for automated, "headless" music generation.

### 3. Live Streaming Scaffolding
- **Functionality:** The "Go Live" button initiates the live streaming workflow.
- **Implementation:** The frontend is equipped with the necessary logic to capture the audio being generated. It uses the `Web Audio API` (`AudioContext`) to route the output to a `MediaRecorder`.
- **Status:** This feature is **frontend-complete but not yet functional end-to-end**. It successfully captures audio chunks but requires a backend WebSocket server to receive *this captured audio data* and broadcast it to a streaming platform. The relevant frontend code is in place but commented out.

---

## Technical Architecture

### Frontend
- **Framework:** [Lit](https://lit.dev/) for creating lightweight, reactive web components (`<prompt-controller>`, `<settings-controller>`, etc.).
- **Language:** TypeScript.
- **API Client:** The official `@google/genai` SDK is used to communicate with the Google GenAI API.
- **Audio:** The `Web Audio API` is used for real-time audio playback, buffering, and routing the audio stream for capture.

### API Communication
- **Model:** `lyria-realtime-exp` (experimental).
- **Pattern:** All API calls are now made **through a backend WebSocket proxy** to the Google API endpoints.

### API Key Management
- **Method:** The API key is now sourced from a **secure environment variable on the backend server**.
- **Status:** This addresses the security concern of exposing the API key in the frontend.