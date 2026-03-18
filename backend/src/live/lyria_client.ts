/**
 * Lyria Client for Continuous Music Generation
 * 
 * Refactored from audio-processing mode to autonomous generation mode.
 * Sends text prompts to initiate continuous music generation without microphone input.
 * Supports real-time parameter updates via chat commands.
 */

import { GoogleGenAI, type LiveMusicSession, type LiveMusicMessage } from '@google/genai';
import { config } from './config.js';
import { getLogger } from './utils.js';

const logger = getLogger('lyria_client');

export interface LyriaParams {
  bpm?: number;
  mood?: string;
  genre?: string;
  intensity?: number;
  temperature?: number;
  duration?: string; // e.g., "continuous", "30s", "5m"
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

  /**
   * Connect to Lyria and establish a live music session
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    logger.info(`Connecting to Lyria model: ${this.model}`);

    try {
      this.session = await this.ai.live.connect({
        model: this.model,
        generationConfig: {
          temperature: this.currentParams.temperature || 0.7,
          responseModalities: ['audio']
        }
      });

      this.session.on('message', (message: LiveMusicMessage) => {
        this.handleLyriaMessage(message);
      });

      this.session.on('error', (error: any) => {
        logger.error('Lyria session error:', error);
        this.connected = false;
        this.onError?.(error);
      });

      this.session.on('close', () => {
        logger.info('Lyria session closed');
        this.connected = false;
        this.generating = false;
      });

      this.connected = true;
      logger.info('Lyria client connected');
    } catch (error) {
      logger.error('Failed to connect to Lyria:', error);
      throw error;
    }
  }

  /**
   * Start continuous music generation with a text prompt
   * 
   * @param prompt - Text description of the music to generate
   * @param params - Generation parameters (BPM, mood, genre, etc.)
   */
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
      // Build the generation prompt with parameters
      const generationPrompt = this.buildGenerationPrompt(prompt, params);
      
      // Send the prompt as text to initiate autonomous generation
      await this.session.send({
        text: generationPrompt
      });

      logger.info('Generation started successfully');
    } catch (error) {
      logger.error('Failed to start generation:', error);
      this.generating = false;
      throw error;
    }
  }

  /**
   * Build a comprehensive generation prompt with parameters
   */
  private buildGenerationPrompt(prompt: string, params: LyriaParams): string {
    const parts: string[] = [];
    
    // Main prompt
    parts.push(prompt);
    
    // Add parameter instructions
    const paramParts: string[] = [];
    if (params.bpm) paramParts.push(`${params.bpm} BPM`);
    if (params.mood) paramParts.push(`${params.mood} mood`);
    if (params.genre) paramParts.push(`${params.genre} genre`);
    if (params.intensity !== undefined) paramParts.push(`intensity ${params.intensity}`);
    if (params.duration) paramParts.push(`duration: ${params.duration}`);
    
    if (paramParts.length > 0) {
      parts.push(`Generate continuous music with: ${paramParts.join(', ')}`);
    }
    
    // Add instruction for continuous/autonomous generation
    parts.push('Generate this music continuously without requiring audio input. Maintain the style and parameters until instructed otherwise.');

    return parts.join('. ');
  }

  /**
   * Stop the current generation
   */
  async stopGeneration(): Promise<void> {
    if (!this.session || !this.generating) {
      return;
    }

    logger.info('Stopping generation');

    try {
      // Send stop command
      await this.session.send({
        text: '/stop generation'
      });
      
      this.generating = false;
      this.currentPrompt = null;
    } catch (error) {
      logger.error('Error stopping generation:', error);
    }
  }

  /**
   * Update generation parameters in real-time
   * Called by chat command handler or API
   */
  async updateParameters(params: LyriaParams): Promise<void> {
    if (!this.session) {
      logger.warn('Cannot update parameters: not connected');
      return;
    }

    // Merge with current params
    this.currentParams = { ...this.currentParams, ...params };

    try {
      const commandText = this.buildParameterCommand(params);
      
      if (commandText) {
        await this.session.send({
          text: commandText
        });
        logger.info('Lyria parameters updated:', params);
      }
    } catch (error) {
      logger.error('Failed to update Lyria parameters:', error);
      throw error;
    }
  }

  /**
   * Build parameter update command for Lyria
   */
  private buildParameterCommand(params: LyriaParams): string {
    const parts: string[] = [];
    
    if (params.bpm !== undefined) {
      parts.push(`Adjust tempo to ${params.bpm} BPM`);
    }
    if (params.mood) {
      parts.push(`Change mood to ${params.mood}`);
    }
    if (params.genre) {
      parts.push(`Switch to ${params.genre} genre`);
    }
    if (params.intensity !== undefined) {
      parts.push(`Set intensity to ${params.intensity}`);
    }
    if (params.temperature !== undefined) {
      parts.push(`Adjust creativity to ${params.temperature}`);
    }
    
    if (parts.length === 0) return '';
    
    // Format as natural language instruction
    return parts.join('. ');
  }

  /**
   * Handle incoming messages from Lyria
   */
  private handleLyriaMessage(message: LiveMusicMessage): void {
    logger.debug('Lyria message received:', {
      hasAudio: !!message.audioData,
      hasText: !!message.text
    });

    // Extract audio data and forward to callback
    if (message.audioData) {
      const audioBuffer = Buffer.from(message.audioData);
      this.onAudioChunk?.(audioBuffer);
    }

    // Log any text responses (confirmations, etc.)
    if (message.text) {
      logger.info('Lyria response:', message.text);
    }
  }

  /**
   * Close the Lyria session
   */
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

  /**
   * Check if connected to Lyria
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Check if currently generating music
   */
  isGenerating(): boolean {
    return this.generating;
  }

  /**
   * Get current generation parameters
   */
  getCurrentParams(): LyriaParams {
    return { ...this.currentParams };
  }

  /**
   * Get current prompt
   */
  getCurrentPrompt(): string | null {
    return this.currentPrompt;
  }
}
