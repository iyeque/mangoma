/**
 * Unified Music Client – supports multiple backends
 *
 * Providers: 'lyria' (Vertex AI), 'stable-audio' (Hugging Face), 'local'
 */

import { config } from './config.js';
import { getLogger } from './utils.js';
import { LyriaClient, type LyriaParams } from './lyria_client.js';
import { StableAudioClient, type StableAudioParams } from './stable_audio_client.js';
import { RiffusionClient, type RiffusionParams } from './riffusion_client.js';

const logger = getLogger('music_client');

export type MusicProvider = 'lyria' | 'stable-audio' | 'riffusion' | 'local';

export interface UnifiedMusicClientOptions {
  provider?: MusicProvider;
  apiKey?: string;
  apiToken?: string;
  projectId?: string;
  location?: string;
  model?: string;
  onAudioChunk?: (audio: Buffer) => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: string) => void;
}

export interface MusicParams {
  prompt: string;
  bpm?: number;
  mood?: string;
  genre?: string;
  intensity?: number;
  temperature?: number;
  duration?: number; // seconds
}

/**
 * UnifiedMusicClient – wrapper that selects provider based on config
 */
export class UnifiedMusicClient {
  private provider: MusicProvider;
  private lyriaClient: LyriaClient | null = null;
  private stableAudioClient: StableAudioClient | null = null;
  private riffusionClient: RiffusionClient | null = null;
  private currentProviderInstance: any = null;
  private connected = false;
  private generating = false;
  private currentPrompt: string | null = null;
  private currentParams: MusicParams = {};

  constructor(options: UnifiedMusicClientOptions) {
    // Determine provider: explicit > env > default (riffusion - zero cost)
    this.provider = options.provider || config.musicProvider || 'riffusion' as MusicProvider;

    logger.info(`Initializing UnifiedMusicClient with provider: ${this.provider}`);

    // Initialize chosen provider(s)
    if (this.provider === 'lyria' || !options.provider) {
      this.lyriaClient = new LyriaClient({
        apiKey: options.apiKey || config.gemini.apiKey,
        model: options.model || config.gemini.model,
        onAudioChunk: options.onAudioChunk,
        onError: options.onError
      });
    }

    if (this.provider === 'stable-audio' || !options.provider) {
      this.stableAudioClient = new StableAudioClient({
        apiToken: options.apiToken || config.stableAudio.apiToken,
        model: options.model || config.stableAudio.model,
        onAudioChunk: options.onAudioChunk,
        onError: options.onError
      });
    }

    if (this.provider === 'riffusion' || !options.provider) {
      this.riffusionClient = new RiffusionClient({
        apiUrl: config.riffusion.apiUrl,
        onAudioChunk: options.onAudioChunk,
        onError: options.onError
      });
    }

    // Set the active provider instance
    switch (this.provider) {
      case 'lyria': this.currentProviderInstance = this.lyriaClient; break;
      case 'stable-audio': this.currentProviderInstance = this.stableAudioClient; break;
      case 'riffusion': this.currentProviderInstance = this.riffusionClient; break;
      default: this.currentProviderInstance = this.riffusionClient;
    }
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    logger.info(`Connecting to music provider: ${this.provider}`);
    try {
      await this.currentProviderInstance.connect();
      this.connected = true;
      this.onStateChange?.('connected');
    } catch (error) {
      logger.error('Failed to connect to music provider:', error);
      throw error;
    }
  }

  async startGeneration(params: MusicParams): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }

    this.currentPrompt = params.prompt;
    this.currentParams = { ...params };
    this.generating = true;

    try {
      if (this.provider === 'lyria') {
        // Map unified params to Lyria params
        const lyriaParams: LyriaParams = {
          bpm: params.bpm,
          mood: params.mood,
          genre: params.genre,
          intensity: params.intensity,
          temperature: params.temperature,
          duration: params.duration ? `${params.duration}s` : undefined
        };
        await this.lyriaClient!.startGeneration(params.prompt, lyriaParams);
      } else if (this.provider === 'stable-audio') {
        // Stable Audio generates full chunks, not continuous
        const stableParams: StableAudioParams = {
          prompt: params.prompt,
          duration: params.duration || 30,
          tempo: params.bpm,
          guidance_scale: params.intensity ? 1 + params.intensity * 4 : 3.5, // map intensity 0-1 to 1-5
        };
        const audio = await this.stableAudioClient!.generate(stableParams);
        this.onAudioChunk?.(audio);
      } else if (this.provider === 'riffusion') {
        // Riffusion generates short clips (5-30 sec)
        const riffusionParams: RiffusionParams = {
          prompt: params.prompt,
          duration: params.duration || 10,
          seed: undefined,
          negative_prompt: 'low quality, noisy, distortion'
        };
        const audio = await this.riffusionClient!.generate(riffusionParams);
        this.onAudioChunk?.(audio);
      }

      this.onStateChange?.('generating');
    } catch (error) {
      this.generating = false;
      this.onError?.(error as Error);
      throw error;
    }
  }

  async stopGeneration(): Promise<void> {
    if (!this.generating) return;

    try {
      await this.currentProviderInstance.stopGeneration();
      this.generating = false;
      this.currentPrompt = null;
      this.onStateChange?.('stopped');
    } catch (error) {
      logger.error('Error stopping generation:', error);
    }
  }

  async updateParameters(params: Partial<MusicParams>): Promise<void> {
    this.currentParams = { ...this.currentParams, ...params };

    try {
      if (this.provider === 'lyria') {
        const lyriaParams: LyriaParams = {};
        if (params.bpm) lyriaParams.bpm = params.bpm;
        if (params.mood) lyriaParams.mood = params.mood;
        if (params.genre) lyriaParams.genre = params.genre;
        if (params.intensity !== undefined) lyriaParams.intensity = params.intensity;
        if (params.temperature !== undefined) lyriaParams.temperature = params.temperature;
        await this.lyriaClient!.updateParameters(lyriaParams);
      } else if (this.provider === 'riffusion' && this.currentPrompt) {
        // Riffusion doesn't support live updates – restart generation with new params
        logger.info('Riffusion: restarting generation with updated parameters');
        await this.startGeneration({
          prompt: this.currentPrompt,
          ...this.currentParams
        });
      }
      // Stable Audio does not support live parameter updates
    } catch (error) {
      logger.error('Failed to update parameters:', error);
      throw error;
    }
  }

  async sendChatCommand(command: string): Promise<void> {
    if (this.provider === 'lyria') {
      await this.lyriaClient!.sendChatCommand(command);
    } else {
      // Parse and apply for stable audio (restart generation with new params)
      // !bpm 80 -> update BPM, restart
      // !mood chill -> update mood, restart
      // etc.
      if (command.startsWith('!bpm ')) {
        const bpm = parseInt(command.slice(5).trim(), 10);
        if (!isNaN(bpm)) {
          await this.updateParameters({ bpm });
          if (this.currentPrompt) {
            await this.startGeneration(this.currentPrompt, this.currentParams);
          }
        }
      } else if (command.startsWith('!mood ')) {
        const mood = command.slice(6).trim();
        if (mood) {
          await this.updateParameters({ mood });
          if (this.currentPrompt) {
            await this.startGeneration(this.currentPrompt, this.currentParams);
          }
        }
      } else if (command.startsWith('!genre ')) {
        const genre = command.slice(7).trim();
        if (genre) {
          await this.updateParameters({ genre });
          if (this.currentPrompt) {
            await this.startGeneration(this.currentPrompt, this.currentParams);
          }
        }
      } else if (command.startsWith('!intensity ')) {
        const intensity = parseFloat(command.slice(11).trim());
        if (!isNaN(intensity)) {
          await this.updateParameters({ intensity });
          if (this.currentPrompt) {
            await this.startGeneration(this.currentPrompt, this.currentParams);
          }
        }
      }
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  isGenerating(): boolean {
    return this.generating;
  }

  getCurrentParams(): MusicParams {
    return { ...this.currentParams };
  }

  getCurrentPrompt(): string | null {
    return this.currentPrompt;
  }

  getProvider(): MusicProvider {
    return this.provider;
  }

  async close(): Promise<void> {
    await this.stopGeneration();
    if (this.lyriaClient) {
      await this.lyriaClient.close();
    }
    if (this.stableAudioClient) {
      await this.stableAudioClient.stop();
    }
    this.connected = false;
    logger.info('UnifiedMusicClient closed');
  }
}
