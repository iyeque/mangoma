import { spawn, ChildProcess } from 'child_process';
import { config } from './config.js';
import { getLogger } from './utils.js';

const logger = getLogger('youtube_rtmp');

export class YouTubeRTMPStreamer {
  private ffmpeg: ChildProcess | null = null;
  private isStreamingFlag: boolean = false;
  private audioQueue: Buffer[] = [];
  private processingQueue: boolean = false;

  constructor(private options: {
    rtmpUrl: string;
    streamKey: string;
    audioBitrate: string;
    sampleRate: number;
    channels: number;
  }) {}

  async start(): Promise<void> {
    if (this.isStreamingFlag) {
      logger.warn('Already streaming');
      return;
    }

    const rtmpUrl = `${this.options.rtmpUrl}/${this.options.streamKey}`;

    logger.info(`Starting RTMP stream to YouTube: ${rtmpUrl}`);

    // FFmpeg command for audio-only RTMP (we'll add a black video later if needed)
    // YouTube requires video, so we'll generate a static image video stream
    this.ffmpeg = spawn('ffmpeg', [
      // Input: raw PCM audio from stdin
      '-f', 's16le',
      '-ar', `${this.options.sampleRate}`,
      '-ac', `${this.options.channels}`,
      '-i', 'pipe:0',
      
      // Generate a static color video (black) as placeholder
      '-f', 'lavfi',
      '-i', 'color=c=black:s=1920x1080:r=30',
      
      // Map both streams: video from lavfi, audio from stdin
      '-map', '0:v',
      '-map', '1:a',
      
      // Video codec (H.264 required by YouTube)
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'veryfast',
      '-tune', 'stillimage',
      '-r', '30',
      
      // Audio codec (AAC required)
      '-c:a', 'aac',
      '-b:a', this.options.audioBitrate,
      '-ar', `${this.options.sampleRate}`,
      '-ac', `${this.options.channels}`,
      
      // Output format for RTMP
      '-f', 'flv',
      '-y', // overwrite output (just in case)
      rtmpUrl
    ]);

    this.ffmpeg.stderr?.on('data', (data) => {
      const msg = data.toString();
      // FFmpeg logs are on stderr
      if (msg.includes('error')) {
        logger.error('FFmpeg:', msg.trim());
      } else {
        logger.debug('FFmpeg:', msg.trim());
      }
    });

    this.ffmpeg.on('exit', (code, signal) => {
      logger.info(`FFmpeg exited with code=${code} signal=${signal}`);
      this.isStreamingFlag = false;
      this.ffmpeg = null;
    });

    this.ffmpeg.on('error', (error) => {
      logger.error('FFmpeg spawn error:', error);
      this.isStreamingFlag = false;
    });

    // Wait a moment for FFmpeg to initialize
    await this.waitForFfmpegReady();
    this.isStreamingFlag = true;
    logger.info('RTMP streaming started');
  }

  private waitForFfmpegReady(): Promise<void> {
    return new Promise((resolve) => {
      // Simple delay; in production we'd parse FFmpeg output for "frame=" or "Output file"
      setTimeout(resolve, 2000);
    });
  }

  async writeAudio(audioData: Buffer): Promise<void> {
    if (!this.ffmpeg || this.ffmpeg.stdin?.writable !== true) {
      logger.warn('FFmpeg not ready, queuing audio (max 1000 chunks)');
      this.audioQueue.push(audioData);
      if (this.audioQueue.length > 1000) {
        this.audioQueue.shift(); // drop oldest
      }
      return;
    }

    // If queue has items, flush them first
    while (this.audioQueue.length > 0 && this.ffmpeg.stdin.writable) {
      const chunk = this.audioQueue.shift();
      if (chunk) {
        this.ffmpeg.stdin.write(chunk);
      }
    }

    // Write current chunk
    this.ffmpeg.stdin.write(audioData);
  }

  async stop(): Promise<void> {
    if (!this.ffmpeg) {
      return;
    }

    logger.info('Stopping RTMP stream...');

    // Flush remaining audio
    if (this.audioQueue.length > 0) {
      logger.info(`Flushing ${this.audioQueue.length} queued audio chunks`);
    }
    while (this.audioQueue.length > 0 && this.ffmpeg.stdin?.writable) {
      const chunk = this.audioQueue.shift();
      if (chunk) {
        this.ffmpeg.stdin.write(chunk);
      }
    }

    // End input cleanly
    this.ffmpeg.stdin?.end();

    // Give FFmpeg time to finish encoding and push to RTMP
    await this.waitForFinish();
  }

  private waitForFinish(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ffmpeg) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        logger.warn('Force killing FFmpeg after timeout');
        this.ffmpeg?.kill('SIGINT');
        resolve();
      }, 10000);

      this.ffmpeg.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  isStreaming(): boolean {
    return this.isStreamingFlag && this.ffmpeg !== null;
  }
}
