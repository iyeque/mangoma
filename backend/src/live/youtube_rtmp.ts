import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import { config } from './config.js';
import { getLogger } from './utils.js';
import {
  VisualizerConfig,
  createVisualizerConfigFromPreset
} from './visualizer.js';

const logger = getLogger('youtube_rtmp');

export interface YouTubeRTMPStreamerOptions {
  rtmpUrl: string;
  streamKey: string;
  audioBitrate: string;
  sampleRate: number;
  channels: number;
  width?: number;
  height?: number;
  fps?: number;
  onChatMessage?: (author: string, text: string) => void;
}

export class YouTubeRTMPStreamer {
  private ffmpeg: ChildProcess | null = null;
  private isStreamingFlag: boolean = false;
  private audioQueue: Buffer[] = [];
  private processingQueue: boolean = false;
  
  // Dynamic configuration that can be updated via chat/API
  private visualizerConfig: VisualizerConfig;
  private chatMessages: { author: string; text: string; timestamp: number }[] = [];
  private maxChatMessages: number = 10;
  
  // Chat overlay file path for FFmpeg drawtext
  private chatOverlayFile: string;
  private chatUpdateInterval: NodeJS.Timeout | null = null;
  private onChatMessage?: (author: string, text: string) => void;

  constructor(private options: YouTubeRTMPStreamerOptions) {
    // Store callback
    this.onChatMessage = options.onChatMessage;
    
    // Initialize visualizer config with default values
    this.visualizerConfig = createVisualizerConfigFromPreset(
      { bpm: 70, mood: 'chill', intensity: 0.6 },
      options.width || 1920,
      options.height || 1080,
      options.fps || 30
    );
    
    // Create chat overlay file in temp directory
    this.chatOverlayFile = `/tmp/mangoma_chat_${Date.now()}.txt`;
    
    // Initialize chat overlay file with empty content
    this.writeChatOverlayFile();
  }

  async start(): Promise<void> {
    if (this.isStreamingFlag) {
      logger.warn('Already streaming');
      return;
    }

    const rtmpUrl = `${this.options.rtmpUrl}/${this.options.streamKey}`;

    logger.info(`Starting RTMP stream with visualizer to YouTube: ${rtmpUrl}`);

    // Build the FFmpeg command using visualizer filters
    const ffmpegArgs = this.buildFFmpegArgs(rtmpUrl);

    this.ffmpeg = spawn('ffmpeg', ffmpegArgs);

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
      this.stopChatUpdates();
    });

    this.ffmpeg.on('error', (error) => {
      logger.error('FFmpeg spawn error:', error);
      this.isStreamingFlag = false;
    });

    // Start chat overlay updates
    this.startChatUpdates();

    // Wait a moment for FFmpeg to initialize
    await this.waitForFfmpegReady();
    this.isStreamingFlag = true;
    logger.info('RTMP streaming with visualizer started');
  }

  /**
   * Build FFmpeg command arguments with visualizer filters
   */
  private buildFFmpegArgs(rtmpUrl: string): string[] {
    const args: string[] = [];
    
    // Input: raw PCM audio from stdin
    args.push('-f', 's16le');
    args.push('-ar', `${this.options.sampleRate}`);
    args.push('-ac', `${this.options.channels}`);
    args.push('-i', 'pipe:0');
    
    // Build filter complex for visualizer + chat overlay
    const filters = this.buildFilterGraph();
    args.push('-filter_complex', filters);
    
    // Video mapping (from filter output)
    args.push('-map', '[outv]');
    // Audio mapping (from audio split)
    args.push('-map', '[a_out]');
    
    // Video codec settings
    args.push('-c:v', 'libx264');
    args.push('-pix_fmt', 'yuv420p');
    args.push('-preset', 'veryfast');
    args.push('-tune', 'stillimage');
    args.push('-r', `${this.options.fps || 30}`);
    
    // Audio codec settings
    args.push('-c:a', 'aac');
    args.push('-b:a', this.options.audioBitrate);
    args.push('-ar', `${this.options.sampleRate}`);
    args.push('-ac', `${this.options.channels}`);
    
    // Output format
    args.push('-f', 'flv');
    args.push('-y', rtmpUrl);
    
    return args;
  }

  /**
   * Build FFmpeg filter graph for visualizer + chat overlay
   * ENHANCED: BPM-reactive pulsing background
   */
  private buildFilterGraph(): string {
    const cfg = this.visualizerConfig;
    const filters: string[] = [];
    
    // 1. Calculate BPM-driven pulse parameters
    const pulseFrequency = (cfg.bpm / 60).toFixed(2); // Hz (beats per second)
    const pulseDuration = (0.3 + (cfg.intensity * 0.2)).toFixed(2); // Duty cycle (30-50%)
    const pulseOpacityMax = (0.15 + (cfg.intensity * 0.1)).toFixed(2); // Max opacity 0.15-0.25
    
    // 2. Create base background with mood color
    const bgColor = this.getMoodColor('background');
    filters.push(`color=c=${bgColor}:s=${cfg.width}x${cfg.height}:r=${cfg.fps}:d=3600[base]`);
    
    // 3. Add BPM-reactive pulse overlay (breathing effect)
    // Creates a semi-transparent overlay that pulses with the beat
    const pulseColor = this.getMoodColor('primary').replace('#', '0x');
    filters.push(`color=c=${pulseColor}:s=${cfg.width}x${cfg.height}:r=${cfg.fps}:a=${pulseOpacityMax}[pulse_color]`);
    filters.push(`[pulse_color]format=rgba,geq=lum='if(gt(mod(t,${1/pulseFrequency}),${pulseDuration}),0,pixel_a*0.8)':cr=0:cb=0:lum_a=1[pulse]`);
    filters.push(`[base][pulse]overlay=format=rgba[base_pulsed]`);
    
    // 4. Split audio into two branches: visualization and output
    filters.push(`[0:a]asplit=2[a_vis][a_out]`);
    
    // 5. Generate waveform visualization from audio
    // Adjust sample count based on BPM: higher BPM = more samples for finer detail
    const waveSamples = Math.max(256, Math.min(4096, Math.round(cfg.bpm * 4)));
    const waveLineWidth = Math.max(1, Math.round(cfg.intensity * 4));
    
    const waveColor = this.getMoodColor('primary').replace('#', '0x');
    const waveOpacity = (0.6 + cfg.intensity * 0.4).toFixed(2);
    const blendMode = cfg.mood === 'chill' || cfg.mood === 'focus' || cfg.mood === 'melancholic' ? 'overlay' : 'screen';
    
    filters.push(`[a_vis]showwaves=mode=line:s=${cfg.width}x${cfg.height}:colors=${waveColor}:scale=lin:split_channels=0:n=${waveSamples}:r=${cfg.fps}[wave]`);
    filters.push(`[base_pulsed][wave]blend=all_mode=${blendMode}:all_opacity=${waveOpacity}[visual]`);
    
    // 6. Add secondary circular pulse effect that expands on beat (for energetic/dark moods)
    if (cfg.mood === 'energetic' || cfg.mood === 'dark' || cfg.mood === 'uplifting') {
      const circleColor = this.getMoodColor('secondary').replace('#', '0x');
      const circleRadius = Math.min(cfg.width, cfg.height) * 0.3;
      const circleExpansion = Math.min(cfg.width, cfg.height) * 0.1;
      
      // Animated expanding circle
      filters.push(`color=c=${circleColor}:s=${cfg.width}x${cfg.height}:r=${cfg.fps}:a=0.3[circle_color]`);
      const circleExpr = `if(lt(mod(t,${1/pulseFrequency}),${pulseDuration}),${circleRadius + circleExpansion},${circleRadius})`;
      filters.push(`[circle_color]geq=lum='if(gte(Y,${cfg.height/2})*gte(X,${cfg.width/2})*lte(sqrt((X-${cfg.width/2})*(X-${cfg.width/2})+(Y-${cfg.height/2})*(Y-${cfg.height/2})),${circleExpr}),1,0)':cr=0:cb=0:lum_a=0.3[circle]`);
      filters.push(`[visual][circle]overlay=format=rgba[visual_circle]`);
    } else {
      filters.push(`[visual]copy[visual_circle]`);
    }
    
    // 7. Add chat overlay if enabled and messages exist
    let currentLabel = 'visual_circle';
    if (cfg.showChat && this.chatMessages.length > 0) {
      const chatFilter = this.buildChatOverlayFilter(cfg);
      if (chatFilter) {
        filters.push(chatFilter);
        currentLabel = 'chatted';
      }
    }
    
    // 8. Add subtle mood tint overlay
    const tintOpacity = (cfg.intensity * 0.12).toFixed(2);
    if (parseFloat(tintOpacity) > 0.01) {
      const tintColor = this.getMoodColor('primary').replace('#', '0x');
      filters.push(`color=c=${tintColor}:s=${cfg.width}x${cfg.height}:r=${cfg.fps}:a=${tintOpacity}[tint]`);
      filters.push(`[${currentLabel}][tint]overlay=format=rgba[outv]`);
    } else {
      filters.push(`[${currentLabel}]copy[outv]`);
    }
    
    return filters.join(';');
  }

  /**
   * Build chat overlay drawtext filter with enhanced styling
   * ENHANCED: Better typography, background blur, and cmd highlighting
   */
  private buildChatOverlayFilter(cfg: VisualizerConfig): string | null {
    const recentMessages = this.chatMessages.slice(-3);
    if (recentMessages.length === 0) return null;
    
    const textColor = cfg.mood === 'dark' || cfg.mood === 'melancholic' ? 'white' : 'black';
    const bgColor = cfg.mood === 'dark' ? 'black@0.7' : 'white@0.7';
    const cmdColor = cfg.mood === 'energetic' || cfg.mood === 'uplifting' ? '#ffffff' : '#7f5af0';
    
    // Build chat lines with command highlighting
    const chatLines = recentMessages.map(m => {
      const text = m.text.replace(/^(!\w+)/, `<b>\\1</b>`); // Highlight commands
      return `${m.author}: ${text}`;
    }).join('\\n');
    
    const x = 50;
    const y = cfg.height - 180; // Position slightly lower
    const box = `box=1:boxcolor=${bgColor}:boxborderw=6:boxblur=2`; // Added blur for smoothness
    const font = `fontsize=24:fontcolor=${textColor}:borderw=1:bordercolor=rgba(0,0,0,0.3)`;
    
    // Enable alpha fade-in (simple approach: always visible)
    // For smoother transitions, we could use multiple drawtext with different enable times
    const text = `text='${chatLines}':${font}:x=${x}:y=${y}`;
    
    // We'll add a subtle slide-in effect by using a slightly lower opacity initially
    // For true animation we'd need multiple filters, but for MVP this is clean
    
    return `[visual]drawtext=${text}:${box}[chatted]`;
  }

  /**
   * Get color for current mood
   */
  private getMoodColor(type: 'primary' | 'secondary' | 'background'): string {
    const moodColors = {
      chill: { primary: '#00a8ff', secondary: '#00d2d3', background: '#0c2461' },
      energetic: { primary: '#e74c3c', secondary: '#f39c12', background: '#922b21' },
      focus: { primary: '#2ecc71', secondary: '#1abc9c', background: '#145a32' },
      nostalgic: { primary: '#d4ac0d', secondary: '#f5b041', background: '#7d6608' },
      happy: { primary: '#f1c40f', secondary: '#3498db', background: '#1a5276' },
      melancholic: { primary: '#8e44ad', secondary: '#5b2c6f', background: '#212f3c' },
      dark: { primary: '#2c3e50', secondary: '#34495e', background: '#000000' },
      uplifting: { primary: '#e67e22', secondary: '#f39c12', background: '#d35400' }
    };
    
    return moodColors[this.visualizerConfig.mood]?.[type] || moodColors.chill[type];
  }

  /**
   * Write chat overlay file for potential use with textfile
   */
  private writeChatOverlayFile(): void {
    const content = this.chatMessages.slice(-3).map(m => `${m.author}: ${m.text}`).join('\n');
    try {
      fs.writeFileSync(this.chatOverlayFile, content, 'utf-8');
    } catch (error) {
      logger.warn('Failed to write chat overlay file:', error);
    }
  }

  /**
   * Start periodic chat overlay updates
   */
  private startChatUpdates(): void {
    if (this.chatUpdateInterval) return;
    
    // Update chat overlay file every 5 seconds
    this.chatUpdateInterval = setInterval(() => {
      this.writeChatOverlayFile();
    }, 5000);
  }

  /**
   * Stop chat updates
   */
  private stopChatUpdates(): void {
    if (this.chatUpdateInterval) {
      clearInterval(this.chatUpdateInterval);
      this.chatUpdateInterval = null;
    }
  }

  private waitForFfmpegReady(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
  }

  async writeAudio(audioData: Buffer): Promise<void> {
    if (!this.ffmpeg || this.ffmpeg.stdin?.writable !== true) {
      logger.warn('FFmpeg not ready, queuing audio (max 1000 chunks)');
      this.audioQueue.push(audioData);
      if (this.audioQueue.length > 1000) {
        this.audioQueue.shift();
      }
      return;
    }

    while (this.audioQueue.length > 0 && this.ffmpeg.stdin.writable) {
      const chunk = this.audioQueue.shift();
      if (chunk) {
        this.ffmpeg.stdin.write(chunk);
      }
    }

    this.ffmpeg.stdin.write(audioData);
  }

  async stop(): Promise<void> {
    if (!this.ffmpeg) {
      this.cleanupChatFile();
      return;
    }

    logger.info('Stopping RTMP stream...');

    this.stopChatUpdates();

    if (this.audioQueue.length > 0) {
      logger.info(`Flushing ${this.audioQueue.length} queued audio chunks`);
    }
    while (this.audioQueue.length > 0 && this.ffmpeg.stdin?.writable) {
      const chunk = this.audioQueue.shift();
      if (chunk) {
        this.ffmpeg.stdin.write(chunk);
      }
    }

    this.ffmpeg.stdin?.end();

    await this.waitForStopConfirmation();
  }

  private async waitForStopConfirmation(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ffmpeg) {
        this.cleanupChatFile();
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        logger.warn('Force killing FFmpeg after timeout');
        this.ffmpeg?.kill('SIGINT');
        this.cleanupChatFile();
        resolve();
      }, 10000);

      this.ffmpeg.once('exit', () => {
        clearTimeout(timeout);
        this.cleanupChatFile();
        resolve();
      });
    });
  }

  /**
   * Clean up chat overlay file
   */
  private cleanupChatFile(): void {
    try {
      if (fs.existsSync(this.chatOverlayFile)) {
        fs.unlinkSync(this.chatOverlayFile);
      }
    } catch (error) {
      logger.warn('Failed to clean up chat overlay file:', error);
    }
  }

  /**
   * Add a chat message to the overlay
   */
  addChatMessage(author: string, text: string): void {
    this.chatMessages.push({
      author,
      text,
      timestamp: Date.now()
    });
    
    if (this.chatMessages.length > this.maxChatMessages) {
      this.chatMessages = this.chatMessages.slice(-this.maxChatMessages);
    }
    
    this.writeChatOverlayFile();
    
    // Notify callback (for chat history/WebSocket broadcast)
    this.onChatMessage?.(author, text);
  }

  /**
   * Clear all chat messages
   */
  clearChat(): void {
    this.chatMessages = [];
    this.writeChatOverlayFile();
  }

  /**
   * Update visualizer parameters in real-time
   */
  updateVisualizerParams(params: {
    bpm?: number;
    mood?: string;
    intensity?: number;
    showChat?: boolean;
  }): void {
    if (params.bpm !== undefined && params.bpm >= 40 && params.bpm <= 200) {
      this.visualizerConfig.bpm = params.bpm;
    }
    
    if (params.mood && this.isValidMood(params.mood)) {
      this.visualizerConfig.mood = params.mood as any;
    }
    
    if (params.intensity !== undefined && params.intensity >= 0 && params.intensity <= 1) {
      this.visualizerConfig.intensity = params.intensity;
    }
    
    if (params.showChat !== undefined) {
      this.visualizerConfig.showChat = params.showChat;
    }
    
    logger.info('Visualizer parameters updated:', this.visualizerConfig);
  }

  private isValidMood(mood: string): mood is keyof typeof this.visualizerConfig.mood {
    return ['chill', 'energetic', 'focus', 'nostalgic', 'happy', 'melancholic', 'dark', 'uplifting'].includes(mood);
  }

  isStreaming(): boolean {
    return this.isStreamingFlag && this.ffmpeg !== null;
  }

  getCurrentConfig(): VisualizerConfig {
    return { ...this.visualizerConfig, chatMessages: [...this.chatMessages] };
  }
}
