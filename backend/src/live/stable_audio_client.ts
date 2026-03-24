/**
 * Stable Audio Client for Music Generation
 *
 * Alternative to Lyria using Hugging Face Inference API.
 * Supports continuous streaming via queued generation.
 */

import axios from 'axios';
import { getLogger } from './utils.js';

const logger = getLogger('stable_audio_client');

export interface StableAudioParams {
  prompt?: string;  // optional when not actively generating
  duration?: number;  // seconds (max 47 for stable-audio-open-1.0)
  tempo?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
}

export interface StableAudioClientOptions {
  apiToken: string;
  model?: string;
  onAudioChunk?: (audio: Buffer) => void;
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
}

/**
 * StableAudioClient – Hugging Face Inference API wrapper
 */
export class StableAudioClient {
  private hfToken: string;
  private apiUrl: string;
  private generating = false;
  private currentPrompt: string | null = null;
  private currentParams: Partial<StableAudioParams> = {};
  private onAudioChunk?: (audio: Buffer) => void;
  private onError?: (error: Error) => void;
  private onProgress?: (progress: number) => void;

  constructor(options: StableAudioClientOptions) {
    this.hfToken = options.apiToken;
    this.apiUrl = `https://api-inference.huggingface.co/models/${options.model || 'stabilityai/stable-audio-open-1.0'}`;
    this.onAudioChunk = options.onAudioChunk;
    this.onError = options.onError;
    this.onProgress = options.onProgress;
  }

  /**
   * Generate audio from prompt. Returns audio buffer.
   * Note: This is NOT realtime – generation takes ~10-60 seconds.
   */
  async generate(params: StableAudioParams): Promise<Buffer> {
    this.currentPrompt = params.prompt;
    this.currentParams = { ...this.currentParams, ...params };
    this.generating = true;

    const payload = {
      inputs: params.prompt,
      parameters: {
        duration: Math.min(params.duration || 30, 47), // model max
        guidance_scale: params.guidance_scale ?? 3.5,
        num_inference_steps: params.num_inference_steps || 64,
        seed: undefined,
        scheduler: 'dpm-solver',
        guidance_rescale: 0.0,
        negative_prompt: 'low quality, noisy, distortion',
        ...(params.tempo && { tempo: params.tempo })
      }
    };

    try {
      logger.info('Generating audio with Stable Audio:', payload);

      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Authorization': `Bearer ${this.hfToken}`,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer',
        timeout: 300000 // 5 minutes max
      });

      if (response.status !== 200) {
        throw new Error(`Stable Audio API error: ${response.status} ${response.statusText}`);
      }

      const audioBuffer = Buffer.from(response.data, 'binary');
      this.generating = false;
      return audioBuffer;
    } catch (error: any) {
      this.generating = false;
      const errMsg = error?.response?.data?.error || error.message || 'Unknown error';
      logger.error('Stable Audio generation failed:', errMsg);
      this.onError?.(new Error(errMsg));
      throw error;
    }
  }

  /**
   * Check if the model is loaded and ready (no 503)
   */
  async isModelReady(): Promise<boolean> {
    try {
      const response = await axios.get(this.apiUrl, {
        headers: { 'Authorization': `Bearer ${this.hfToken}` },
        timeout: 10000
      });
      return response.status === 200;
    } catch (err: any) {
      if (err.response?.status === 503) {
        // Model warming up
        return false;
      }
      // Other errors – treat as not ready
      return false;
    }
  }

  /**
   * Get estimated compute units for a generation
   */
  getEstimatedCost(duration: number = 30): number {
    // Rough estimate: ~471 CU per 30 sec on free tier
    return Math.round((duration / 30) * 471);
  }

  isGenerating(): boolean {
    return this.generating;
  }

  async stop(): Promise<void> {
    this.generating = false;
    logger.info('Stable Audio generation stopped');
  }
}
