/**
 * Unified Music Client – Minimal implementation for Riffusion primary
 * 
 * Supports multiple providers but only chunk-based generation is used.
 */

import { config } from './config.js';
import { getLogger } from './utils.js';
import { RiffusionClient } from './riffusion_client.js';

const logger = getLogger('music_client');

export type MusicProvider = 'riffusion' | 'stable-audio' | 'lyria';

export interface MusicClientOptions {
  provider?: MusicProvider;
  apiKey?: string;
  apiToken?: string;
  projectId?: string;
  location?: string;
  model?: string;
  onError?: (error: Error) => void | Promise<void>;
  onStateChange?: (state: string) => void | Promise<void>;
}

export class UnifiedMusicClient {
  private provider: MusicProvider;
  private client: RiffusionClient | null = null;
  private connected = false;

  constructor(options: MusicClientOptions) {
    this.provider = options.provider || config.musicProvider || 'riffusion';
    logger.info(`Initializing UnifiedMusicClient: provider=${this.provider}`);

    if (this.provider === 'riffusion') {
      this.client = new RiffusionClient({
        apiUrl: config.riffusion.apiUrl,
        onError: options.onError,
      });
    } else {
      throw new Error(`Provider ${this.provider} not implemented in simplified client`);
    }
  }

  async connect(): Promise<void> {
    if (this.connected || !this.client) return;
    const healthy = await this.client.isHealthy();
    if (!healthy) {
      throw new Error(`Music provider ${this.provider} is not healthy`);
    }
    this.connected = true;
  }

  async generate(params: { prompt: string; duration: number }): Promise<Buffer> {
    if (!this.connected) {
      await this.connect();
    }
    if (!this.client) {
      throw new Error('No client initialized');
    }
    return await this.client.generate({
      prompt: params.prompt,
      duration: params.duration
    });
  }

  async stop(): Promise<void> {
    if (this.client) {
      await this.client.stop();
    }
    this.connected = false;
  }

  isHealthy(): Promise<boolean> {
    return this.client ? this.client.isHealthy() : Promise.resolve(false);
  }

  getProvider(): string {
    return this.provider;
  }
}
