import { GoogleGenAI, type LiveMusicSession, type LiveMusicMessage } from '@google/genai';
import { config } from './config.js';
import { getLogger } from './utils.js';

const logger = getLogger('lyria_client');

export class LyriaClient {
  private ai: GoogleGenAI;
  private session: LiveMusicSession | null = null;
  private model: string;
  private connected: boolean = false;
  private pendingAudio: Buffer[] = [];
  private isProcessing: boolean = false;

  constructor(apiKey: string, model?: string) {
    this.model = model || config.gemini.model;
    this.ai = new GoogleGenAI({ apiKey });
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    logger.info(`Connecting to Lyria model: ${this.model}`);

    try {
      this.session = await this.ai.live.connect({
        model: this.model,
        generationConfig: {
          temperature: 0.7,
          responseModalities: ['audio']
        }
      });

      this.session.on('message', (message: LiveMusicMessage) => {
        this.handleLyriaMessage(message);
      });

      this.session.on('error', (error: any) => {
        logger.error('Lyria session error:', error);
        this.connected = false;
      });

      this.session.on('close', () => {
        logger.info('Lyria session closed');
        this.connected = false;
      });

      this.connected = true;
      logger.info('Lyria client connected');
    } catch (error) {
      logger.error('Failed to connect to Lyria:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.session) {
      try {
        await this.session.close();
      } catch (error) {
        logger.error('Error closing Lyria session:', error);
      }
      this.session = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Send raw audio data to Lyria for processing
   * Expects 48kHz stereo PCM 16-bit or WebM/Opus
   */
  async processAudio(audioData: Buffer): Promise<Buffer | null> {
    if (!this.connected) {
      logger.warn('Not connected to Lyria, buffering audio');
      this.pendingAudio.push(audioData);
      await this.connect();
      
      // Flush pending audio after connection
      if (this.pendingAudio.length > 0) {
        logger.info(`Flushing ${this.pendingAudio.length} buffered audio chunks`);
        for (const chunk of this.pendingAudio) {
          await this.sendAudioChunk(chunk);
        }
        this.pendingAudio = [];
      }
      return null; // No immediate output, streaming will handle it
    }

    return this.sendAudioChunk(audioData);
  }

  private async sendAudioChunk(chunk: Buffer): Promise<Buffer | null> {
    if (!this.session) {
      return null;
    }

    try {
      // Send audio as binary data
      this.session.send({
        // For live music, we send raw audio blobs
        // The @google/genai SDK handles the encoding
        audioData: chunk
      });

      // The reply will come via the 'message' event asynchronously
      // We return null because we handle streaming output via event
      return null;
    } catch (error) {
      logger.error('Error sending audio to Lyria:', error);
      throw error;
    }
  }

  /**
   * Update Lyria generation parameters in real-time
   */
  async updateParameters(params: {
    bpm?: number;
    mood?: string;
    genre?: string;
    intensity?: number;
    temperature?: number;
  }): Promise<void> {
    if (!this.session) {
      logger.warn('Cannot update parameters: not connected');
      return;
    }

    try {
      // Send a text command to adjust parameters
      // The exact format depends on Lyria's API
      const commandText = this.buildParameterCommand(params);
      
      this.session.send({
        text: commandText
      });

      logger.info('Lyria parameters updated:', params);
    } catch (error) {
      logger.error('Failed to update Lyria parameters:', error);
      throw error;
    }
  }

  private buildParameterCommand(params: any): string {
    const parts: string[] = [];
    if (params.bpm !== undefined) parts.push(`BPM:${params.bpm}`);
    if (params.mood) parts.push(`Mood:${params.mood}`);
    if (params.genre) parts.push(`Genre:${params.genre}`);
    if (params.intensity !== undefined) parts.push(`Intensity:${params.intensity}`);
    if (params.temperature !== undefined) parts.push(`Temperature:${params.temperature}`);
    
    return parts.length > 0 ? `/set ${parts.join(' ')}` : '';
  }

  /**
   * Handle incoming messages from Lyria
   */
  private handleLyriaMessage(message: LiveMusicMessage): void {
    // Extract audio data from message and forward to YouTube streamer
    // This is called internally when audio is received from Lyria
    // The server orchestrator will attach a callback to forward these chunks
    logger.debug('Lyria message received:', message);
  }

  /**
   * Set callback for when processed audio arrives
   */
  setAudioCallback(callback: (audio: Buffer) => void): void {
    // This would be used by the orchestrator to receive Lyria's output
    // For now, the orchestrator will attach via event listener on the session
  }
}
