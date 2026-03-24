/**
 * StreamRunner – Orchestrates music generation and YouTube streaming
 * 
 * Simplified: no visualizer, uses FFmpeg testsrc for video.
 * Keeps interactive controls via WebSocket and chat poller.
 */

import { spawn, ChildProcess } from 'child_process';
import { MusicProvider } from './music_client.js';
import { config } from './config.js';
import { getLogger } from './utils.js';

const logger = getLogger('stream_runner');

export interface StreamRunnerOptions {
  provider: MusicProvider;
  initialPrompt: string;
  chunkDuration?: number;  // seconds per chunk
  bufferSize?: number;     // number of chunks to keep ahead
  onChunkGenerated?: (chunk: Buffer) => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: 'starting' | 'streaming' | 'stopping' | 'stopped') => void;
}

interface GenerationParams {
  prompt: string;
  bpm?: number;
  mood?: string;
  genre?: string;
  intensity?: number;
}

export class StreamRunner {
  private provider: MusicProvider;
  private prompt: string;
  private chunkDuration: number;
  private bufferSize: number;
  private onChunkGenerated?: (chunk: Buffer) => void;
  private onError?: (error: Error) => void;
  private onStateChange?: (state: StreamRunnerOptions['onStateChange']) => void;

  private ffmpeg: ChildProcess | null = null;
  private isRunning = false;
  private buffer: Buffer[] = [];
  private pendingUpdates: GenerationParams[] = [];
  private currentParams: GenerationParams = { prompt: '' };

  constructor(options: StreamRunnerOptions) {
    this.provider = options.provider;
    this.prompt = options.initialPrompt;
    this.chunkDuration = options.chunkDuration || 15;
    this.bufferSize = options.bufferSize || 3;
    this.onChunkGenerated = options.onChunkGenerated;
    this.onError = options.onError;
    this.onStateChange = options.onStateChange;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.onStateChange?.('starting');
    logger.info('Starting stream runner');

    try {
      // Connect to music provider
      await this.provider.connect();
      logger.info('Music provider connected');

      // Start FFmpeg
      this.startFFmpeg();

      // Start generation loop
      this.isRunning = true;
      this.onStateChange?.('streaming');

      // Begin generation pipeline
      this.generationLoop().catch(err => {
        logger.error('Generation loop crashed:', err);
        this.onError?.(err);
      });
    } catch (error) {
      this.isRunning = false;
      this.onError?.(error as Error);
      throw error;
    }
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isRunning) {
        resolve();
        return;
      }

      this.isRunning = false;
      this.onStateChange?.('stopping');
      logger.info('Stopping stream runner');

      // Kill FFmpeg
      if (this.ffmpeg) {
        this.ffmpeg.kill('SIGTERM');
        this.ffmpeg = null;
      }

      // Stop provider
      this.provider.stop().catch(console.error);

      this.onStateChange?.('stopped');
      resolve();
    });
  }

  /**
   * Update generation parameters (BPM, mood, genre, etc.)
   * These will be applied to the next generated chunk.
   */
  updateParams(params: Partial<GenerationParams>): void {
    this.pendingUpdates.push({ ...this.currentParams, ...params });
  }

  private async generationLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Apply any pending parameter updates
        if (this.pendingUpdates.length > 0) {
          const update = this.pendingUpdates.shift()!;
          this.currentParams = { ...this.currentParams, ...update };
          // Update prompt template if needed
          this.prompt = this.buildPrompt(this.currentParams);
          logger.info('Updated generation params:', this.currentParams);
        }

        // Generate next audio chunk
        const startTime = Date.now();
        const audio = await this.provider.generateChunk(this.prompt, this.chunkDuration);
        const genTime = Date.now() - startTime;

        // Push to buffer
        this.buffer.push(audio);
        logger.info(`Generated chunk ${this.buffer.length} (${(genTime/1000).toFixed(1)}s, ${audio.length} bytes)`);

        // Write to FFmpeg stdin if it's alive
        if (this.ffmpeg && !this.ffmpeg.killed) {
          this.ffmpeg.stdin?.write(audio);
        } else {
          logger.warn('FFmpeg not running, discarding chunk');
        }

        // Trim buffer if it gets too large (backpressure)
        while (this.buffer.length > this.bufferSize * 2) {
          this.buffer.shift();
        }

        this.onChunkGenerated?.(audio);

      } catch (error) {
        logger.error('Chunk generation failed:', error);
        this.onError?.(error as Error);
        // Wait before retry to avoid tight loop
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  private startFFmpeg(): void {
    const args = [
      // Video source: test pattern (color bars)
      '-f', 'lavfi', '-i', `testsrc=size=1280x720:rate=30`,
      // Audio from stdin (raw PCM)
      '-f', 's16le',
      '-ar', `${config.audio.sampleRate}`,
      '-ac', `${config.audio.channels}`,
      '-i', 'pipe:0',
      // Video codec
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'stillimage',
      '-pix_fmt', 'yuv420p',
      // Audio codec
      '-c:a', 'aac',
      '-b:a', config.audio.bitrate,
      // End when audio ends (shortest)
      '-shortest',
      // Output format
      '-f', 'flv',
      // RTMP URL
      `${config.youtube.rtmpUrl}/${config.youtube.streamKey}`
    ];

    logger.info('Starting FFmpeg', { args: args.slice(0, 8).concat('...') });

    this.ffmpeg = spawn('ffmpeg', args, {
      stdio: ['pipe', 'ignore', 'pipe']  // stdin, stdout (ignored), stderr
    });

    this.ffmpeg.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      // Only log important FFmpeg messages
      if (msg.includes('error') || msg.includes('panic') || msg.includes('Connection to')) {
        logger.warn('FFmpeg:', msg);
      }
    });

    this.ffmpeg.on('exit', (code, signal) => {
      logger.info(`FFmpeg exited: code=${code} signal=${signal}`);
      if (this.isRunning) {
        logger.error('FFmpeg died unexpectedly, restarting in 5s...');
        setTimeout(() => this.startFFmpeg(), 5000);
      }
    });

    this.ffmpeg.on('error', (err) => {
      logger.error('FFmpeg spawn error:', err);
      this.onError?.(err);
    });
  }

  private buildPrompt(params: GenerationParams): string {
    const parts: string[] = ['lofi hip hop beats'];
    if (params.bpm) parts.push(`${params.bpm}bpm`);
    if (params.mood) parts.push(params.mood);
    if (params.genre) parts.push(params.genre);
    if (params.intensity) parts.push(params.intensity > 0.5 ? 'energetic' : 'chill');
    return parts.join(' ');
  }

  getState(): object {
    return {
      running: this.isRunning,
      bufferSize: this.buffer.length,
      currentParams: this.currentParams,
      ffmpegAlive: this.ffmpeg && !this.ffmpeg.killed
    };
  }
}
