/**
 * Mangoma Live – Simplified Server
 * 
 * Features:
 * - REST API: /stream/start, /stream/stop, /health
 * - WebSocket: /ws for real-time control
 * - Chat poller for YouTube live chat commands
 * - No visualizer (uses FFmpeg testsrc)
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from './config.js';
import { getLogger, setupLogging } from './utils.js';
import { UnifiedMusicClient } from './music_client.js';
import { StreamRunner } from './stream_runner.js';
import { PresetsAPI } from './presets_api.js';
import { ChatPoller } from './chat_poller.js';

const logger = getLogger('server');
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(express.json());

// State (simplified)
let musicClient: UnifiedMusicClient | null = null;
let streamRunner: StreamRunner | null = null;
let chatPoller: ChatPoller | null = null;
let currentPreset: any = null;
let activeConnections = new Set<WebSocket>();

// WebSocket handling
wss.on('connection', (ws) => {
  const clientId = Math.random().toString(36).substring(2, 9);
  activeConnections.add(ws);
  logger.info(`WebSocket client connected: ${clientId}`);

  // Send initial state
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    streaming: !!streamRunner,
    params: streamRunner?.getState() || null
  }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleWebSocketMessage(ws, msg);
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }
  });

  ws.on('close', () => {
    activeConnections.delete(ws);
    logger.info(`WebSocket client disconnected: ${clientId}`);
  });
});

function broadcastToClients(message: object) {
  const msg = JSON.stringify(message);
  activeConnections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

async function handleWebSocketMessage(ws: WebSocket, msg: any) {
  switch (msg.type) {
    case 'update':
      if (streamRunner) {
        streamRunner.updateParams(msg.params);
        broadcastToClients({ type: 'parameters_updated', params: msg.params });
      }
      break;
    case 'status':
      ws.send(JSON.stringify({
        type: 'status',
        streaming: !!streamRunner,
        state: streamRunner?.getState() || null,
        provider: musicClient?.getProvider() || null
      }));
      break;
    default:
      logger.warn('Unknown WS message type:', msg.type);
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    connections: activeConnections.size,
    streaming: !!streamRunner,
    provider: musicClient?.getProvider() || null,
    runnerState: streamRunner?.getState() || null
  });
});

// Start stream
app.post('/api/stream/start', async (req, res) => {
  try {
    const { presetId, customPrompt } = req.body;
    
    if (!presetId && !customPrompt) {
      return res.status(400).json({ error: 'presetId or customPrompt is required' });
    }

    // Load preset or use custom prompt
    let preset = null;
    let prompt = customPrompt;
    let genre: string | undefined;
    let mood: string | undefined;
    
    if (presetId) {
      preset = await presetsAPI.load(presetId);
      if (!preset) {
        return res.status(404).json({ error: 'Preset not found' });
      }
      
      genre = preset.lyria?.params?.genre || 'lo-fi';
      mood = preset.lyria?.params?.mood || 'chill';
      prompt = `Lofi hip hop beats, ${mood} mood, ${genre} genre`;
    }

    // Stop existing stream if any
    if (streamRunner) {
      await streamRunner.stop();
      streamRunner = null;
    }
    if (musicClient) {
      await musicClient.close();
      musicClient = null;
    }

    // Initialize music provider
    musicClient = new UnifiedMusicClient({
      provider: config.musicProvider,
      apiKey: config.gemini.apiKey,
      apiToken: config.stableAudio.apiToken,
      projectId: config.vertex.projectId,
      location: config.vertex.location,
      model: preset?.lyria?.model || config.gemini.model,
      onAudioChunk: () => {}, // StreamRunner manages its own buffer
      onError: (err) => logger.error('Music client error:', err),
      onStateChange: (state) => logger.info(`Music client: ${state}`)
    });

    await musicClient.connect();
    logger.info(`Music provider connected: ${musicClient.getProvider()}`);

    // Create stream runner
    streamRunner = new StreamRunner({
      provider: musicClient,
      initialPrompt: prompt,
      chunkDuration: 15,
      bufferSize: 3,
      onChunkGenerated: (chunk) => {
        logger.debug(`Chunk: ${chunk.length} bytes`);
      },
      onError: (err) => {
        logger.error('StreamRunner error:', err);
        broadcastToClients({ type: 'error', message: err.message });
      },
      onStateChange: (state) => {
        logger.info(`Stream state: ${state}`);
        broadcastToClients({ type: 'stream_state', state });
      }
    });

    await streamRunner.start();
    currentPreset = preset;

    // Start chat poller (interactive commands)
    if (preset?.interaction?.realtimeAdjustments?.enabled ?? true) {
      // Adapt StreamRunner to ChatPoller's expected interface
      const pollerClient = {
        updateParams: (params: any) => streamRunner.updateParams(params),
        isConnected: () => true
      };
      
      chatPoller = new ChatPoller(
        pollerClient,
        null, // no YouTube streamer needed
        {
          enabled: true,
          pollIntervalMs: 5000,
          cooldownSeconds: preset?.interaction?.realtimeAdjustments?.cooldownSeconds || 300,
          allowedCommands: ['!bpm', '!mood', '!genre', '!intensity', '!help'],
          useSimulation: true
        }
      );
      
      chatPoller.setCommandHandler(async (command, args, author) => {
        logger.debug(`Chat command ${command} by ${author}`);
        broadcastToClients({ type: 'chat_command', command, author, args });
      });
      
      chatPoller.start();
      logger.info('Chat poller started');
    }

    logger.info(`Stream started: preset=${presetId || 'custom'}`);
    res.json({
      status: 'streaming',
      preset: presetId,
      provider: musicClient.getProvider(),
      message: 'Stream started'
    });

  } catch (error) {
    logger.error('Failed to start stream:', error);
    if (streamRunner) await streamRunner.stop();
    if (musicClient) await musicClient.close();
    res.status(500).json({ error: 'Failed to start stream' });
  }
});

// Stop stream
app.post('/api/stream/stop', async (req, res) => {
  try {
    if (streamRunner) {
      await streamRunner.stop();
      streamRunner = null;
    }
    if (musicClient) {
      await musicClient.close();
      musicClient = null;
    }
    if (chatPoller) {
      chatPoller.stop();
      chatPoller = null;
    }
    currentPreset = null;
    
    logger.info('Stream stopped');
    res.json({ status: 'stopped' });
  } catch (error) {
    logger.error('Failed to stop stream:', error);
    res.status(500).json({ error: 'Failed to stop stream' });
  }
});

// Presets API
app.get('/api/presets', async (req, res) => {
  try {
    const presets = await presetsAPI.list();
    res.json({ presets });
  } catch (error) {
    logger.error('Failed to list presets:', error);
    res.status(500).json({ error: 'Failed to list presets' });
  }
});

// Start server
const PORT = config.server.port || 8080;
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Mangoma server listening on port ${PORT}`);
  logger.info(`Music provider: ${config.musicProvider}`);
  logger.info(`YouTube RTMP: ${config.youtube.rtmpUrl}/[streamKey]`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  if (streamRunner) await streamRunner.stop();
  if (musicClient) await musicClient.close();
  if (chatPoller) chatPoller.stop();
  server.close();
  process.exit(0);
});
