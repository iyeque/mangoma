/**
 * Lyria Client for Continuous Music Generation
 *
 * Updated to use @google/genai v1.x Live Music API.
 */

import { GoogleGenAI, type LiveMusicSession } from '@google/genai';
import { config } from './config.js';
import { getLogger } from './utils.js';

const logger = getLogger('lyria_client');

export interface LyriaParams {
  bpm?: number;
  mood?: string;
  genre?: string;
  intensity?: number;
  temperature?: number;
  duration?: string; // e.g., "continuous"
}

export interface LyriaClientOptions {
  apiKey: string;
  model?: string;
  onAudioChunk?: (audio: Buffer) => void;
  onError?: (error: Error) => void;
}

export class LyriaClient {
  private ai: GoogleGenAI;
  private session: LiveMusicSession | null = null;
  private model: string;
  private connected: boolean = false;
  private generating: boolean = false;
  private currentPrompt: string | null = null;
  private currentParams: LyriaParams = {};
  private onAudioChunk?: (audio: Buffer) => void;
  private onError?: (error: Error) => void;

  constructor(options: LyriaClientOptions) {
    this.model = options.model || config.gemini.model;
    this.ai = new GoogleGenAI({ apiKey: options.apiKey });
    this.onAudioChunk = options.onAudioChunk;
    this.onError = options.onError;
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    logger.info(`Connecting to Lyria model: ${this.model}`);

    try {
      this.session = await this.ai.live.music.connect({
        model: this.model,
        callbacks: {
          onmessage: (e: MessageEvent) => this.handleLyriaMessage(e),
          onerror: (e: ErrorEvent) => {
            logger.error('Lyria session error:', e.error);
            this.connected = false;
            this.onError?.(e.error);
          },
          onclose: () => {
            logger.info('Lyria session closed');
            this.connected = false;
            this.generating = false;
          }
        }
      });

      this.connected = true;
      logger.info('Lyria client connected');
    } catch (error) {
      logger.error('Failed to connect to Lyria:', error);
      throw error;
    }
  }

  async startGeneration(prompt: string, params: LyriaParams = {}): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }

    if (!this.session) {
      throw new Error('Lyria session not initialized');
    }

    logger.info(`Starting continuous generation: "${prompt}"`, params);

    this.currentPrompt = prompt;
    this.currentParams = { ...this.currentParams, ...params };
    this.generating = true;

    try {
      const generationPrompt = this.buildGenerationPrompt(prompt, params);
      
      // Set weighted prompts
      await this.session.setWeightedPrompts({
        weightedPrompts: [{ text: generationPrompt, weight: 1 }]
      });

      // Apply config parameters if provided
      const configUpdate: any = {};
      if (params.temperature !== undefined) configUpdate.temperature = params.temperature;
      if (params.bpm !== undefined) configUpdate.bpm = params.bpm;
      // Additional mapping: intensity -> density/brightness could be added
      if (Object.keys(configUpdate).length > 0) {
        await this.session.setMusicGenerationConfig({ musicGenerationConfig: configUpdate });
      }

      // Start playback
      await this.session.play();

      logger.info('Generation started successfully');
    } catch (error) {
      logger.error('Failed to start generation:', error);
      this.generating = false;
      throw error;
    }
  }

  async stopGeneration(): Promise<void> {
    if (!this.session || !this.generating) {
      return;
    }

    logger.info('Stopping generation');

    try {
      await this.session.stop();
      this.generating = false;
      this.currentPrompt = null;
    } catch (error) {
      logger.error('Error stopping generation:', error);
    }
  }

  async updateParameters(params: LyriaParams): Promise<void> {
    if (!this.session) {
      logger.warn('Cannot update parameters: not connected');
      return;
    }

    this.currentParams = { ...this.currentParams, ...params };

    try {
      // Rebuild prompt to reflect any changes to mood, genre, intensity, etc.
      if (this.currentPrompt) {
        const newPrompt = this.buildGenerationPrompt(this.currentPrompt, this.currentParams);
        await this.session.setWeightedPrompts({
          weightedPrompts: [{ text: newPrompt, weight: 1 }]
        });
      }

      // Update numeric config directly
      const configUpdate: any = {};
      if (params.bpm !== undefined) configUpdate.bpm = params.bpm;
      if (params.temperature !== undefined) configUpdate.temperature = params.temperature;
      if (Object.keys(configUpdate).length > 0) {
        await this.session.setMusicGenerationConfig({ musicGenerationConfig: configUpdate });
      }

      logger.info('Lyria parameters updated:', params);
    } catch (error) {
      logger.error('Failed to update Lyria parameters:', error);
      throw error;
    }
  }

  async sendChatCommand(command: string): Promise<void> {
    // Parse simple commands: !bpm 80, !mood chill, !genre ambient, !intensity 0.8
    if (command.startsWith('!bpm ')) {
      const bpm = parseInt(command.slice(5).trim(), 10);
      if (!isNaN(bpm)) {
        await this.updateParameters({ bpm });
        return;
      }
    } else if (command.startsWith('!mood ')) {
      const mood = command.slice(6).trim();
      if (mood) {
        await this.updateParameters({ mood });
        return;
      }
    } else if (command.startsWith('!genre ')) {
      const genre = command.slice(7).trim();
      if (genre) {
        await this.updateParameters({ genre });
        return;
      }
    } else if (command.startsWith('!intensity ')) {
      const intensity = parseFloat(command.slice(11).trim());
      if (!isNaN(intensity)) {
        await this.updateParameters({ intensity });
        return;
      }
    }
    logger.info(`Chat command received (unhandled): ${command}`);
  }

  private buildGenerationPrompt(prompt: string, params: LyriaParams): string {
    const parts: string[] = [];
    parts.push(prompt);

    const paramParts: string[] = [];
    if (params.bpm) paramParts.push(`${params.bpm} BPM`);
    if (params.mood) paramParts.push(`${params.mood} mood`);
    if (params.genre) paramParts.push(`${params.genre} genre`);
    if (params.intensity !== undefined) paramParts.push(`intensity ${params.intensity}`);
    if (params.duration) paramParts.push(`duration: ${params.duration}`);

    if (paramParts.length > 0) {
      parts.push(`Generate continuous music with: ${paramParts.join(', ')}`);
    }

    parts.push('Generate this music continuously without requiring audio input. Maintain the style and parameters until instructed otherwise.');

    return parts.join('. ');
  }

  private handleLyriaMessage(event: MessageEvent): void {
    const data = event.data;
    let parsed: any;

    if (typeof data === 'string') {
      try {
        parsed = JSON.parse(data);
      } catch (err) {
        // Non-JSON text, treat as plain text message
        parsed = { text: data };
      }
    } else {
      // Binary data? Unlikely as per spec (audio in JSON base64)
      parsed = { text: `[binary data of length ${data ? data.byteLength : 0}]` };
    }

    // Handle audioChunks array (newer format)
    if (parsed.audioChunks && Array.isArray(parsed.audioChunks)) {
      for (const chunk of parsed.audioChunks) {
        if (chunk.data) {
          const audioBuffer = Buffer.from(chunk.data, 'base64');
          this.onAudioChunk?.(audioBuffer);
        }
      }
    } else if (parsed.audio) {
      // Fallback: message has an 'audio' field (maybe base64 string or { data })
      if (typeof parsed.audio === 'string') {
        const audioBuffer = Buffer.from(parsed.audio, 'base64');
        this.onAudioChunk?.(audioBuffer);
      } else if (parsed.audio.data) {
        const audioBuffer = Buffer.from(parsed.audio.data, 'base64');
        this.onAudioChunk?.(audioBuffer);
      }
    }

    if (parsed.text) {
      logger.info('Lyria response:', parsed.text);
    }
  }

  async close(): Promise<void> {
    if (this.generating) {
      await this.stopGeneration();
    }

    if (this.session) {
      try {
        await this.session.close();
      } catch (error) {
        logger.error('Error closing Lyria session:', error);
      }
      this.session = null;
    }
    this.connected = false;
    this.generating = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  isGenerating(): boolean {
    return this.generating;
  }

  getCurrentParams(): LyriaParams {
    return { ...this.currentParams };
  }

  getCurrentPrompt(): string | null {
    return this.currentPrompt;
  }
}
