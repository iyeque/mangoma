/**
 * Mangoma Live Streaming Server
 * 
 * Continuous music generation pipeline:
 * Lyria generates music autonomously from text prompts → YouTube RTMP stream
 * WebSocket is control-only (chat commands, parameter updates) - NO microphone audio
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { config } from './config.js';
import { UnifiedMusicClient } from './music_client.js';
// import { YouTubeRTMPStreamer } from './youtube_rtmp.js';  // COMMENTED OUT
import { PresetsAPI } from './presets_api.js';
import { ChatPoller } from './chat_poller.js';
import { getLogger, setupLogging } from './utils.js';
import { StreamRunner } from './stream_runner.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = getLogger('server');

// Initialize express app
const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend static files from live dashboard
const liveFrontendPath = join(__dirname, '../../../frontend/live');
app.use(express.static(liveFrontendPath));

// Create HTTP server
const server = createServer(app);

// Create WebSocket server for control commands
const wss = new WebSocketServer({ 
  server,
  path: '/live/stream'
});

// State
let musicClient: UnifiedMusicClient | null = null;
// let youtubeStreamer: YouTubeRTMPStreamer | null = null;  // COMMENTED OUT
let streamRunner: StreamRunner | null = null;
let chatPoller: ChatPoller | null = null;
let currentPreset: any = null;
let activeConnections = new Set<WebSocket>();
let chatHistory: { author: string; text: string; timestamp: number }[] = [];
const maxChatHistory = 100;

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    connections: activeConnections.size,
    streaming: youtubeStreamer?.isStreaming() ?? false,
    generating: musicClient?.isGenerating() ?? false,
    provider: musicClient?.getProvider() ?? null
  });
});

/**
 * Presets API endpoints
 */
const presetsAPI = new PresetsAPI(config.presets.dir);

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
 * Start continuous music generation stream
 * 
 * This endpoint:
 * 1. Loads the preset configuration
 * 2. Initializes Lyria client for autonomous generation
 * 3. Starts YouTube RTMP stream
 * 4. Begins continuous music generation from text prompt
 */
app.post('/api/stream/start', async (req, res) => {
  try {
    const { presetId, customPrompt } = req.body;
    
    if (!presetId && !customPrompt) {
      return res.status(400).json({ error: 'presetId or customPrompt is required' });
    }

    // Load preset or use custom prompt
    let preset = null;
    let prompt = customPrompt;
    
    if (presetId) {
      preset = await presetsAPI.load(presetId);
      if (!preset) {
        return res.status(404).json({ error: 'Preset not found' });
      }
      
      // Build prompt from preset
      prompt = `Generate continuous ${preset.lyria.params.genre || 'lo-fi'} music with ${preset.lyria.params.mood || 'chill'} mood`;
    }

    // Stop existing stream if any
    if (youtubeStreamer) {
      await youtubeStreamer.stop();
    }
    
    if (musicClient) {
      await musicClient.close();
    }

    // Initialize unified music client (Lyria or Stable Audio based on config)
    musicClient = new UnifiedMusicClient({
      provider: config.musicProvider,
      apiKey: config.gemini.apiKey,
      apiToken: config.stableAudio.apiToken,
      projectId: config.vertex.projectId,
      location: config.vertex.location,
      model: preset?.lyria?.model || config.gemini.model,
      onAudioChunk: async (audio: Buffer) => {
        // Forward generated audio to YouTube streamer
        if (youtubeStreamer?.isStreaming()) {
          await youtubeStreamer.writeAudio(audio);
        }
      },
      onError: (error) => {
        logger.error('Music generation error:', error);
      },
      onStateChange: (state) => {
        logger.info(`Music client state changed: ${state}`);
      }
    });
    
    // Initialize YouTube streamer
    youtubeStreamer = new YouTubeRTMPStreamer({
      rtmpUrl: config.youtube.rtmpUrl,
      streamKey: config.youtube.streamKey,
      audioBitrate: config.audio.bitrate,
      sampleRate: config.audio.sampleRate,
      channels: config.audio.channels,
      // Pass chat callback to collect messages for history/WebSocket
      onChatMessage: (author: string, text: string) => {
        addChatMessage(author, text);
      }
    });

    currentPreset = preset;

    // Start YouTube streaming first
    await youtubeStreamer.start();
    logger.info('YouTube RTMP stream started');

    // Connect to music provider and start continuous generation
    await musicClient.connect();
    await musicClient.startGeneration({ prompt });
    logger.info(`Music generation started with provider: ${musicClient.getProvider()}`);

    // Initialize chat poller if enabled
    if (preset?.interaction?.realtimeAdjustments?.enabled) {
      chatPoller = new ChatPoller(
        musicClient,
        youtubeStreamer,
        {
          enabled: preset.youtube?.chatEnabled ?? true,
          pollIntervalMs: 5000,
          cooldownSeconds: preset.interaction.realtimeAdjustments.cooldownSeconds || 300,
          allowedCommands: ['!bpm', '!mood', '!genre', '!intensity', '!visualize', '!help'],
          useSimulation: true // MVP: use simulation mode; set false and add API key for production
        }
      );
      
      // Set up chat message callback to store in history
      chatPoller.setCommandHandler(async (command, args, author) => {
        // This runs after command processing - could send notifications, etc.
        logger.debug(`Command processed via handler: ${command} by ${author}`);
      });
      
      chatPoller.start();
      logger.info('Chat poller started (simulation mode)');
    }

    logger.info(`Stream started with preset: ${presetId || 'custom'}`);
    res.json({ 
      status: 'streaming', 
      preset: presetId,
      prompt,
      provider: musicClient.getProvider(),
      message: 'Continuous music generation started'
    });

  } catch (error) {
    logger.error('Failed to start stream:', error);
    
    // Cleanup on error
    if (youtubeStreamer) {
      await youtubeStreamer.stop();
      youtubeStreamer = null;
    }
    if (musicClient) {
      await musicClient.close();
      musicClient = null;
    }
    
    res.status(500).json({ error: 'Failed to start stream', details: error.message });
  }
});

/**
 * Stop streaming and generation
 */
app.post('/api/stream/stop', async (req, res) => {
  try {
    // Stop chat poller
    if (chatPoller) {
      chatPoller.stop();
      chatPoller = null;
    }

    // Stop music generation
    if (musicClient) {
      await musicClient.close();
      musicClient = null;
    }
    
    // Stop YouTube stream
    if (youtubeStreamer) {
      await youtubeStreamer.stop();
      youtubeStreamer = null;
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
 * Update stream parameters in real-time via API
 */
app.post('/api/stream/update', async (req, res) => {
  try {
    if (!musicClient) {
      return res.status(400).json({ error: 'No active stream' });
    }

    const { bpm, mood, genre, intensity, temperature } = req.body;
    
    // Update music client parameters
    await musicClient.updateParameters({ bpm, mood, genre, intensity, temperature });

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
    generating: musicClient?.isGenerating() ?? false,
    preset: currentPreset?.id ?? null,
    prompt: musicClient?.getCurrentPrompt() ?? null,
    params: musicClient?.getCurrentParams() ?? null,
    connections: activeConnections.size,
    music: {
      connected: musicClient?.isConnected() ?? false,
      provider: musicClient?.getProvider() ?? null,
      model: config.gemini.model
    }
  });
});

/**
 * Get recent chat history (for dashboard)
 */
app.get('/api/chat', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const recent = chatHistory.slice(-limit).reverse(); // newest first
  res.json({ messages: recent, total: chatHistory.length });
});

/**
 * Clear chat history
 */
app.delete('/api/chat', (req, res) => {
  chatHistory = [];
  res.json({ message: 'Chat history cleared' });
});

/**
 * Broadcast chat message to all connected WebSocket clients
 */
function broadcastChatMessage(message: { author: string; text: string; timestamp: number }) {
  const payload = JSON.stringify({
    type: 'chat_message',
    ...message
  });
  
  for (const ws of activeConnections) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

/**
 * Add chat message to history and broadcast
 */
function addChatMessage(author: string, text: string) {
  const message = { author, text, timestamp: Date.now() };
  chatHistory.push(message);
  if (chatHistory.length > maxChatHistory) {
    chatHistory = chatHistory.slice(-maxChatHistory);
  }
  broadcastChatMessage(message);
}

/**
 * WebSocket handler for control commands ONLY
 * No microphone audio - this is for chat commands and parameter updates
 */
wss.on('connection', (ws: WebSocket, req: any) => {
  const clientId = req.socket.remoteAddress || 'unknown';
  logger.info(`Control client connected: ${clientId}`);
  
  activeConnections.add(ws);

  // Send welcome message with current status and recent chat
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    timestamp: Date.now(),
    preset: currentPreset?.id ?? null,
    generating: musicClient?.isGenerating() ?? false,
    params: musicClient?.getCurrentParams() ?? null,
    chatHistory: chatHistory.slice(-10), // last 10 messages
    message: 'Connected to Mangoma Live control. Send commands to adjust music generation.'
  }));

  // Handle incoming control messages
  ws.on('message', async (data: Buffer) => {
    try {
      const text = data.toString();
      
      // All messages should be JSON control commands
      if (!text.startsWith('{')) {
        ws.send(JSON.stringify({ type: 'error', message: 'Only JSON control messages accepted' }));
        return;
      }

      const message = JSON.parse(text);
      await handleControlMessage(ws, message);
    } catch (error) {
      logger.error('Error processing control message:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    logger.info(`Control client disconnected: ${clientId}`);
    activeConnections.delete(ws);
  });

  ws.on('error', (error) => {
    logger.error(`WebSocket error for ${clientId}:`, error);
    activeConnections.delete(ws);
  });
});

/**
 * Handle control messages from clients
 * Supports: ping, preset, update, chat_command
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
          
          // Update music provider if streaming
          if (musicClient) {
            await musicClient.updateParameters(preset.lyria?.params as any);
          }
        }
      }
      break;

    case 'update':
      // Real-time parameter update
      if (musicClient) {
        await musicClient.updateParameters(data);
        ws.send(JSON.stringify({ 
          type: 'parameters_updated', 
          params: data,
          currentParams: musicClient.getCurrentParams()
        }));
      }
      break;

    case 'chat_command':
      // Simulate a chat command (for testing or API-triggered commands)
      if (data.command && data.args) {
        const { command, args, author = 'System' } = data;
        const fullCmd = `${command} ${args.join(' ')}`.trim();
        
        logger.info(`Chat command via WebSocket: ${fullCmd} by ${author}`);
        
        // Add command to chat overlay (so viewers see it)
        if (youtubeStreamer) {
          youtubeStreamer.addChatMessage(author, fullCmd);
        }
        
        // Process the command if music generation is active
        if (musicClient) {
          const params: any = {};
          switch (command) {
            case '!bpm':
              params.bpm = parseInt(args[0], 10);
              break;
            case '!mood':
              params.mood = args[0];
              break;
            case '!genre':
              params.genre = args[0];
              break;
            case '!intensity':
              params.intensity = parseFloat(args[0]);
              break;
            case '!visualize':
              params.showChat = args[0] === 'on' || args[0] === 'true';
              break;
          }
          
          if (Object.keys(params).length > 0) {
            await musicClient.updateParameters(params);
            
            // Also update visualizer if needed
            if (youtubeStreamer) {
              youtubeStreamer.updateVisualizerParams(params);
            }
            
            ws.send(JSON.stringify({ 
              type: 'command_executed',
              command,
              params
            }));
          }
        }
      }
      break;

    case 'status':
      // Request current status
      ws.send(JSON.stringify({
        type: 'status',
        streaming: youtubeStreamer?.isStreaming() ?? false,
        generating: musicClient?.isGenerating() ?? false,
        preset: currentPreset?.id ?? null,
        params: musicClient?.getCurrentParams() ?? null
      }));
      break;

    default:
      logger.warn('Unknown control message type:', type);
      ws.send(JSON.stringify({ type: 'error', message: `Unknown command: ${type}` }));
  }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  logger.info('Shutting down...');
  
  // Stop chat poller
  if (chatPoller) {
    chatPoller.stop();
  }
  
  // Close music generation
  if (musicClient) {
    await musicClient.close();
  }
  
  // Stop YouTube stream
  if (youtubeStreamer) {
    await youtubeStreamer.stop();
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
║         Mangoma Live - Continuous Generation             ║
╠══════════════════════════════════════════════════════════╣
║  Status: Running                                         ║
║  WebSocket: ws://${config.server.host}:${config.server.port}/live/stream          ║
║  HTTP API:  http://${config.server.host}:${config.server.port}                      ║
║  Health:    http://${config.server.host}:${config.server.port}/health               ║
║  Mode:     Autonomous (no mic required)                    ║
║  Model:     ${config.gemini.model.padEnd(35)}║
╚══════════════════════════════════════════════════════════╝
  `);
});

// SPA fallback: serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../../../frontend/live/index.html'));
});

export { app, server, wss };
