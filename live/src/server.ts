/**
 * Mangoma Live Streaming Server
 * WebSocket server that receives audio from frontend, processes via Google Lyria,
 * and streams to YouTube via RTMP
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { config } from './config.js';
import { LyriaClient } from './lyria_client.js';
import { YouTubeRTMPStreamer } from './youtube_rtmp.js';
import { PresetsAPI } from './presets_api.js';
import { getLogger, setupLogging } from './utils.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = getLogger('server');

// Initialize express app
const app = express();
app.use(cors());
app.use(express.json());
// Serve frontend static files at root
app.use(express.static(join(__dirname, '../frontend')));

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ 
  server,
  path: '/live/stream'
});

// State
let lyriaClient: LyriaClient | null = null;
let youtubeStreamer: YouTubeRTMPStreamer | null = null;
let currentPreset: any = null;
let activeConnections = new Set<WebSocket>();

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    connections: activeConnections.size,
    streaming: youtubeStreamer?.isStreaming() ?? false
  });
});

/**
 * Presets API endpoints
 */
const presetsAPI = new PresetsAPI(config.presetsDir);

app.get('/api/presets', async (req, res) => {
  try {
    const presets = await presetsAPI.list();
    res.json({ presets });
  } catch (error) {
    logger.error('Failed to list presets:', error);
    res.status(500).json({ error: 'Failed to list presets' });
  }
});

app.get('/api/presets/:id', async (req, res) => {
  try {
    const preset = await presetsAPI.load(req.params.id);
    if (!preset) {
      return res.status(404).json({ error: 'Preset not found' });
    }
    res.json({ preset });
  } catch (error) {
    logger.error('Failed to load preset:', error);
    res.status(500).json({ error: 'Failed to load preset' });
  }
});

app.post('/api/presets', async (req, res) => {
  try {
    const { id, ...data } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Preset ID is required' });
    }
    const preset = await presetsAPI.save(id, data);
    res.json({ preset, message: 'Preset saved' });
  } catch (error) {
    logger.error('Failed to save preset:', error);
    res.status(500).json({ error: 'Failed to save preset' });
  }
});

app.delete('/api/presets/:id', async (req, res) => {
  try {
    await presetsAPI.delete(req.params.id);
    res.json({ message: 'Preset deleted' });
  } catch (error) {
    logger.error('Failed to delete preset:', error);
    res.status(500).json({ error: 'Failed to delete preset' });
  }
});

/**
 * Start streaming with preset
 */
app.post('/api/stream/start', async (req, res) => {
  try {
    const { presetId } = req.body;
    
    if (!presetId) {
      return res.status(400).json({ error: 'presetId is required' });
    }

    // Load preset
    const preset = await presetsAPI.load(presetId);
    if (!preset) {
      return res.status(404).json({ error: 'Preset not found' });
    }

    // Stop existing stream if any
    if (youtubeStreamer) {
      await youtubeStreamer.stop();
    }

    // Initialize Lyria client
    lyriaClient = new LyriaClient(config.gemini.apiKey, config.lyria.model);
    
    // Initialize YouTube streamer
    youtubeStreamer = new YouTubeRTMPStreamer({
      rtmpUrl: config.youtube.rtmpUrl,
      streamKey: config.youtube.streamKey,
      audioBitrate: config.audio.bitrate,
      sampleRate: config.audio.sampleRate,
      channels: config.audio.channels
    });

    currentPreset = preset;

    // Start streaming
    await youtubeStreamer.start();

    logger.info(`Stream started with preset: ${presetId}`);
    res.json({ 
      status: 'streaming', 
      preset: presetId,
      message: 'Stream started successfully'
    });

  } catch (error) {
    logger.error('Failed to start stream:', error);
    res.status(500).json({ error: 'Failed to start stream', details: error.message });
  }
});

/**
 * Stop streaming
 */
app.post('/api/stream/stop', async (req, res) => {
  try {
    if (youtubeStreamer) {
      await youtubeStreamer.stop();
      youtubeStreamer = null;
    }
    
    if (lyriaClient) {
      await lyriaClient.close();
      lyriaClient = null;
    }

    currentPreset = null;

    logger.info('Stream stopped');
    res.json({ status: 'stopped', message: 'Stream stopped successfully' });

  } catch (error) {
    logger.error('Failed to stop stream:', error);
    res.status(500).json({ error: 'Failed to stop stream' });
  }
});

/**
 * Update stream parameters in real-time
 */
app.post('/api/stream/update', async (req, res) => {
  try {
    if (!lyriaClient) {
      return res.status(400).json({ error: 'No active stream' });
    }

    const { bpm, mood, genre, intensity } = req.body;
    
    // Update Lyria parameters
    await lyriaClient.updateParameters({ bpm, mood, genre, intensity });

    logger.info('Stream parameters updated:', { bpm, mood, genre, intensity });
    res.json({ 
      status: 'updated', 
      params: { bpm, mood, genre, intensity }
    });

  } catch (error) {
    logger.error('Failed to update stream parameters:', error);
    res.status(500).json({ error: 'Failed to update parameters' });
  }
});

/**
 * Get current stream status
 */
app.get('/api/stream/status', (req, res) => {
  res.json({
    streaming: youtubeStreamer?.isStreaming() ?? false,
    preset: currentPreset?.id ?? null,
    connections: activeConnections.size,
    lyria: {
      connected: lyriaClient?.isConnected() ?? false,
      model: config.lyria.model
    }
  });
});

/**
 * WebSocket handler for audio streaming
 */
wss.on('connection', (ws: WebSocket, req: any) => {
  const clientId = req.socket.remoteAddress || 'unknown';
  logger.info(`Client connected: ${clientId}`);
  
  activeConnections.add(ws);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    timestamp: Date.now(),
    preset: currentPreset?.id ?? null
  }));

  // Handle incoming messages (audio chunks or control commands)
  ws.on('message', async (data: Buffer) => {
    try {
      // Check if it's a control message (JSON) or audio data
      const text = data.toString();
      if (text.startsWith('{')) {
        const message = JSON.parse(text);
        await handleControlMessage(ws, message);
      } else {
        // Audio data - forward to Lyria
        await handleAudioData(ws, data);
      }
    } catch (error) {
      logger.error('Error processing message:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }));
    }
  });

  ws.on('close', () => {
    logger.info(`Client disconnected: ${clientId}`);
    activeConnections.delete(ws);
  });

  ws.on('error', (error) => {
    logger.error(`WebSocket error for ${clientId}:`, error);
    activeConnections.delete(ws);
  });
});

/**
 * Handle control messages from clients
 */
async function handleControlMessage(ws: WebSocket, message: any) {
  const { type, ...data } = message;

  switch (type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;

    case 'preset':
      // Load and apply preset
      if (data.presetId && presetsAPI) {
        const preset = await presetsAPI.load(data.presetId);
        if (preset) {
          currentPreset = preset;
          ws.send(JSON.stringify({ 
            type: 'preset_loaded', 
            preset: preset.id 
          }));
          
          // Update Lyria if streaming
          if (lyriaClient) {
            await lyriaClient.updateParameters(preset.lyria?.params);
          }
        }
      }
      break;

    case 'update':
      // Real-time parameter update
      if (lyriaClient) {
        await lyriaClient.updateParameters(data);
        ws.send(JSON.stringify({ type: 'parameters_updated', params: data }));
      }
      break;

    default:
      logger.warn('Unknown control message type:', type);
  }
}

/**
 * Handle audio data from clients
 */
async function handleAudioData(ws: WebSocket, audioData: Buffer) {
  // Forward audio to Lyria for processing
  if (lyriaClient) {
    try {
      const processedAudio = await lyriaClient.processAudio(audioData);
      
      // Send processed audio back to client (optional, for monitoring)
      if (processedAudio) {
        ws.send(processedAudio);
      }

      // If YouTube streaming is active, pipe to RTMP
      if (youtubeStreamer?.isStreaming()) {
        await youtubeStreamer.writeAudio(processedAudio || audioData);
      }
    } catch (error) {
      logger.error('Error processing audio:', error);
    }
  } else if (youtubeStreamer?.isStreaming()) {
    // No Lyria, but streaming to YouTube - send raw audio
    await youtubeStreamer.writeAudio(audioData);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  logger.info('Shutting down...');
  
  // Close YouTube stream
  if (youtubeStreamer) {
    await youtubeStreamer.stop();
  }
  
  // Close Lyria client
  if (lyriaClient) {
    await lyriaClient.close();
  }
  
  // Close WebSocket connections
  for (const ws of activeConnections) {
    ws.close(1001, 'Server shutting down');
  }
  
  // Close server
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  
  // Force exit after timeout
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
server.listen(config.server.port, config.server.host, () => {
  logger.info(`
╔══════════════════════════════════════════════════════════╗
║           Mangoma Live Streaming Server                  ║
╠══════════════════════════════════════════════════════════╣
║  Status: Running                                         ║
║  WebSocket: ws://${config.server.host}:${config.server.port}/live/stream          ║
║  HTTP API:  http://${config.server.host}:${config.server.port}                      ║
║  Health:    http://${config.server.host}:${config.server.port}/health               ║
║  Model:     ${config.gemini.model.padEnd(35)}║
╚══════════════════════════════════════════════════════════╝
  `);
});

// SPA fallback: serve index.html for any non-API route
app.get('*', (req, res) => {
  // Send index.html for all other GET routes (SPA client-side routing)
  res.sendFile(join(__dirname, '../frontend/index.html'));
});

export { app, server, wss };
