/**
 * Riffusion Client – Local HTTP API wrapper
 * 
 * Connects to locally-running Riffusion server (Python Flask)
 * for CPU-friendly music generation.
 */

import axios from 'axios';
import { getLogger } from './utils.js';

const logger = getLogger('riffusion_client');

export interface RiffusionParams {
  prompt: string;
  duration?: number;  // seconds (max 30 for CPU)
  seed?: number;
  negative_prompt?: string;
}

export interface RiffusionClientOptions {
  apiUrl?: string;  // default: http://localhost:3000
  onAudioChunk?: (audio: Buffer) => void;
  onError?: (error: Error) => void;
  onProgress?: (progress: number) => void;
}

export class RiffusionClient {
  private apiUrl: string;
  private generating = false;
  private currentPrompt: string | null = null;
  private currentParams: RiffusionParams = {};
  private onAudioChunk?: (audio: Buffer) => void;
  private onError?: (error: Error) => void;
  private onProgress?: (progress: number) => void;

  constructor(options: RiffusionClientOptions = {}) {
    this.apiUrl = options.apiUrl || process.env.RIFFUSION_API_URL || 'http://localhost:3000';
    this.onAudioChunk = options.onAudioChunk;
    this.onError = options.onError;
    this.onProgress = options.onProgress;
  }

  /**
   * Check if the local server is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.apiUrl}/health`, { timeout: 5000 });
      return response.data?.status === 'ok';
    } catch (err) {
      logger.error('Riffusion server health check failed:', err.message);
      return false;
    }
  }

  /**
   * Generate audio from prompt
   * Returns Buffer (WAV format)
   */
  async generate(params: RiffusionParams): Promise<Buffer> {
    this.currentPrompt = params.prompt;
    this.currentParams = { ...params };
    this.generating = true;

    const payload = {
      prompt: params.prompt,
      duration: Math.min(params.duration || 10, 30), // enforce max 30s for CPU
      seed: params.seed,
      negative_prompt: params.negative_prompt || 'low quality, noisy, distortion'
    };

    try {
      logger.info('Generating audio with Riffusion:', payload);
      
      const response = await axios.post(`${this.apiUrl}/generate`, payload, {
        responseType: 'arraybuffer',
        timeout: 300000  // 5 minutes max (CPU generation can be slow)
      });

      if (response.status !== 200) {
        throw new Error(`Riffusion API error: ${response.status} ${response.statusText}`);
      }

      const audioBuffer = Buffer.from(response.data, 'binary');
      this.generating = false;
      return audioBuffer;
    } catch (error: any) {
      this.generating = false;
      const errMsg = error?.response?.data?.error || error.message || 'Unknown error';
      logger.error('Riffusion generation failed:', errMsg);
      this.onError?.(new Error(errMsg));
      throw error;
    }
  }

  /**
   * Get server info (model, device, capabilities)
   */
  async getInfo(): Promise<any> {
    try {
      const response = await axios.get(`${this.apiUrl}/info`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get Riffusion info:', error);
      return null;
    }
  }

  /**
   * Check if server is healthy (shortcut)
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.apiUrl}/health`, { timeout: 2000 });
      return response.status === 200 && response.data?.status === 'ok';
    } catch {
      return false;
    }
  }

  isGenerating(): boolean {
    return this.generating;
  }

  async stop(): Promise<void> {
    this.generating = false;
    logger.info('Riffusion generation stopped');
  }
}
