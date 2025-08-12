# Mangoma - AI Music Studio

A web application for real-time generative music, leveraging Google's GenAI.

## Project Structure

```
mangoma/ (root directory)
├── backend/               # Node.js + Express backend
│   ├── src/
│   │   # (controllers, models, routes, services, types, utils directories removed as they are empty)
│   ├── .env              # Backend environment variables
│   └── package.json
│
└── frontend/              # Lit/TypeScript frontend
    ├── .env.local         # Frontend environment variables (for GEMINI_API_KEY)
    ├── .gitignore
    ├── future.md          # Future development roadmap
    ├── index.css          # Main CSS for the new frontend
    ├── index.html         # Main HTML for the new frontend
    ├── index.tsx          # Main TypeScript/Lit frontend application
    ├── metadata.json
    ├── package.json       # Frontend dependencies and scripts
    ├── present.md         # Current architecture of the new frontend
    ├── README.md          # Frontend-specific README (now moved to root)
    ├── tsconfig.json
    ├── utils.ts           # Frontend utility functions
    └── vite.config.ts     # Vite configuration for the new frontend
```

## Setup Instructions

This project consists of a Node.js backend and a Lit/TypeScript frontend.

### 1. Backend Setup

1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Install backend dependencies:
    ```bash
    npm install
    ```
    *Note: If `npm install` fails, ensure you have Node.js and npm installed correctly. You might need to run `npm install` from the project root if you encounter workspace-related errors.* 
3.  Configure backend environment variables:
    - Copy `.env.example` to `.env` in the `backend/` directory and adjust as needed.
    - **Crucially, set your `GEMINI_API_KEY` in this `.env` file.** This key is used by the backend to proxy requests to the Google GenAI API.
4.  Start the backend server:
    ```bash
    npm run dev
    ```

### 2. Frontend Setup

1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```
2.  Install frontend dependencies:
    ```bash
    npm install
    ```
3.  Set the `GEMINI_API_KEY` in `.env.local` in the `frontend/` directory to your Gemini API key. This is used by the frontend for direct API calls (though now proxied by the backend).
4.  Run the frontend application:
    ```bash
    npm run dev
    ```

### 3. Access the Application

Open your browser and navigate to the address provided by the Vite development server (usually `http://localhost:5173` or similar).

## Features

- Real-time music generation based on text prompts using Google GenAI.
- Interactive UI for managing prompts and their influence on music.
- Advanced settings for fine-tuning music generation parameters (temperature, guidance, BPM, scale, etc.).
- Preset authoring system to save and load configurations as JSON.
- Live streaming scaffolding (requires backend integration for full functionality).

## Technologies Used

- **Frontend:**
  - Lit (Web Components)
  - TypeScript
  - Vite
  - Web Audio API
  - `@google/genai` SDK (client-side interaction, proxied by backend)
- **Backend:**
  - Node.js + Express
  - WebSocket (for GenAI proxy)

## Notes
- The `GEMINI_API_KEY` is now securely managed on the backend for proxying Google GenAI requests.
- The frontend now communicates with the backend proxy for GenAI interactions.

## License

MIT License