/**
 * Simple Riffusion Live Stream – Minimal version
 * 
 * 1. Generates continuous audio chunks from Riffusion
 * 2. Pipes through FFmpeg to YouTube RTMP
 * 3. No visualizer, no WebSocket server
 * 
 * Run: npx tsx stream_simple.ts
 */

import { spawn } from 'child_process';
import { config } from './src/live/config.js';
import { RiffusionClient } from './src/live/riffusion_client.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load .env if present
const dotenvPath = join(process.cwd(), 'backend', '.env');
if (existsSync(dotenvPath)) {
  const envContent = readFileSync(dotenvPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.join('=').trim();
    }
  });
}

const logger = { info: console.log, error: console.error };

async function startStream() {
  // Initialize Riffusion client
  const riffusion = new RiffusionClient({
    apiUrl: config.riffusion.apiUrl,
    onAudioChunk: (audio) => {
      // Pipe audio chunk to FFmpeg stdin
      if (ffmpeg.stdin && !ffmpeg.stdin.closed) {
        ffmpeg.stdin.write(audio);
      }
    },
    onError: (err) => logger.error('Riffusion error:', err),
    onProgress: (pct) => logger.info(`Generation: ${pct}%`)
  });

  // Check health
  if (!(await riffusion.isHealthy?.() ?? false)) {
    logger.error('Riffusion server not healthy. Is it running?');
    process.exit(1);
  }

  // FFmpeg: read raw WAV from stdin, transcode to AAC, stream to YouTube
  const ffmpeg = spawn('ffmpeg', [
    '-f', 'wav',           // input format (WAV from Riffusion)
    '-i', 'pipe:0',        // read from stdin
    '-acodec', 'aac',      // encode to AAC
    '-ab', config.audio.bitrate,
    '-ar', `${config.audio.sampleRate}`,
    '-ac', `${config.audio.channels}`,
    '-f', 'flv',           // FLV container for RTMP
    `${config.youtube.rtmpUrl}/${config.youtube.streamKey}`
  ], {
    stdio: ['pipe', 'inherit', 'inherit']
  });

  ffmpeg.on('error', (err) => logger.error('FFmpeg error:', err));
  ffmpeg.on('exit', (code) => logger.info('FFmpeg exited with code', code));

  logger.info('Starting continuous generation loop...');
  logger.info(`Streaming to YouTube RTMP: ${config.youtube.rtmpUrl}/${config.youtube.streamKey}`);

  // Generation loop
  let chunkNumber = 0;
  const basePrompt = 'Lofi hip hop beats, chill and relaxing, no vocals';

  while (true) {
    try {
      logger.info(`Generating chunk ${chunkNumber + 1}...`);
      const audio = await riffusion.generate({
        prompt: basePrompt,
        duration: 15,  // 15-second chunks
      });

      logger.info(`Chunk ${chunkNumber + 1} ready (${audio.length} bytes)`);
      chunkNumber++;
    } catch (err) {
      logger.error('Generation failed, retrying in 5s...', err);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  process.exit(0);
});

startStream().catch(console.error);
