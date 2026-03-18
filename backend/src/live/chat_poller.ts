/**
 * YouLive Chat Poller
 * 
 * Polls YouLive chat for viewer commands and triggers Lyria parameter updates.
 * Supports commands: !bpm, !mood, !genre, !intensity, !help
 */

import { getLogger } from './utils.js';
import type { LyriaClient } from './lyria_client.js';

const logger = getLogger('chat_poller');

export interface ChatMessage {
  id: string;
  author: string;
  text: string;
  timestamp: number;
}

export interface ChatPollerOptions {
  enabled: boolean;
  pollIntervalMs: number;
  cooldownSeconds: number;
  allowedCommands: string[];
}

export type ChatCommandHandler = (command: string, args: string[], author: string) => Promise<void>;

export class ChatPoller {
  private enabled: boolean;
  private pollIntervalMs: number;
  private cooldownSeconds: number;
  private allowedCommands: string[];
  private lyriaClient: LyriaClient;
  private polling: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastCommandTime: Map<string, number> = new Map();
  private lastMessageId: string | null = null;
  private onCommand?: ChatCommandHandler;

  constructor(lyriaClient: LyriaClient, options: ChatPollerOptions, onCommand?: ChatCommandHandler) {
    this.lyriaClient = lyriaClient;
    this.enabled = options.enabled;
    this.pollIntervalMs = options.pollIntervalMs || 5000;
    this.cooldownSeconds = options.cooldownSeconds || 300;
    this.allowedCommands = options.allowedCommands || ['!bpm', '!mood', '!genre', '!intensity', '!help'];
    this.onCommand = onCommand;
  }

  /**
   * Start polling for chat messages
   */
  start(): void {
    if (!this.enabled) {
      logger.info('Chat polling disabled');
      return;
    }

    if (this.polling) {
      logger.warn('Already polling');
      return;
    }

    logger.info(`Starting chat polling (interval: ${this.pollIntervalMs}ms)`);
    this.polling = true;
    this.poll();
  }

  /**
   * Stop polling
   */
  stop(): void {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    logger.info('Chat polling stopped');
  }

  /**
   * Poll for new chat messages
   */
  private async poll(): Promise<void> {
    if (!this.polling) return;

    try {
      // Fetch new messages from YouLive API
      // Note: This is a placeholder - actual implementation depends on YouLive API
      const messages = await this.fetchChatMessages();
      
      // Process each message
      for (const message of messages) {
        await this.processMessage(message);
      }
    } catch (error) {
      logger.error('Error polling chat:', error);
    }

    // Schedule next poll
    this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
  }

  /**
   * Fetch chat messages from YouLive
   * TODO: Implement actual YouLive API integration
   */
  private async fetchChatMessages(): Promise<ChatMessage[]> {
    // Placeholder implementation
    // In production, this would call the YouLive API
    // For now, return empty array
    return [];
  }

  /**
   * Process a chat message and check for commands
   */
  private async processMessage(message: ChatMessage): Promise<void> {
    // Skip if we've already seen this message
    if (this.lastMessageId === message.id) {
      return;
    }
    this.lastMessageId = message.id;

    const text = message.text.trim();
    
    // Check if message starts with a command
    if (!text.startsWith('!')) {
      return;
    }

    const parts = text.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Check if command is allowed
    if (!this.allowedCommands.includes(command)) {
      return;
    }

    // Check cooldown
    if (!this.checkCooldown(command, message.timestamp)) {
      logger.debug(`Command ${command} from ${message.author} on cooldown`);
      return;
    }

    logger.info(`Chat command: ${command} ${args.join(' ')} by ${message.author}`);

    // Handle the command
    await this.handleCommand(command, args, message.author);
  }

  /**
   * Check if command is on cooldown
   */
  private checkCooldown(command: string, timestamp: number): boolean {
    const lastTime = this.lastCommandTime.get(command);
    if (!lastTime) return true;

    const elapsed = (timestamp - lastTime) / 1000;
    return elapsed >= this.cooldownSeconds;
  }

  /**
   * Handle a chat command
   */
  private async handleCommand(command: string, args: string[], author: string): Promise<void> {
    // Update cooldown
    this.lastCommandTime.set(command, Date.now());

    try {
      switch (command) {
        case '!bpm':
          await this.handleBpmCommand(args, author);
          break;
        case '!mood':
          await this.handleMoodCommand(args, author);
          break;
        case '!genre':
          await this.handleGenreCommand(args, author);
          break;
        case '!intensity':
          await this.handleIntensityCommand(args, author);
          break;
        case '!help':
          await this.handleHelpCommand(author);
          break;
        default:
          logger.warn(`Unknown command: ${command}`);
      }

      // Call custom handler if provided
      await this.onCommand?.(command, args, author);
    } catch (error) {
      logger.error(`Error handling command ${command}:`, error);
    }
  }

  /**
   * Handle !bpm command
   */
  private async handleBpmCommand(args: string[], author: string): Promise<void> {
    const bpm = parseInt(args[0], 10);
    if (isNaN(bpm) || bpm < 40 || bpm > 200) {
      logger.warn(`Invalid BPM from ${author}: ${args[0]}`);
      return;
    }

    await this.lyriaClient.updateParameters({ bpm });
    logger.info(`BPM changed to ${bpm} by ${author}`);
  }

  /**
   * Handle !mood command
   */
  private async handleMoodCommand(args: string[], author: string): Promise<void> {
    const mood = args[0]?.toLowerCase();
    const validMoods = ['chill', 'energetic', 'focus', 'nostalgic', 'happy', 'melancholic', 'dark', 'uplifting'];
    
    if (!mood || !validMoods.includes(mood)) {
      logger.warn(`Invalid mood from ${author}: ${args[0]}. Valid: ${validMoods.join(', ')}`);
      return;
    }

    await this.lyriaClient.updateParameters({ mood });
    logger.info(`Mood changed to ${mood} by ${author}`);
  }

  /**
   * Handle !genre command
   */
  private async handleGenreCommand(args: string[], author: string): Promise<void> {
    const genre = args[0]?.toLowerCase();
    const validGenres = ['lo-fi', 'jazz', 'ambient', 'synthwave', 'electronic', 'classical', 'hip-hop', 'rock'];
    
    if (!genre || !validGenres.includes(genre)) {
      logger.warn(`Invalid genre from ${author}: ${args[0]}. Valid: ${validGenres.join(', ')}`);
      return;
    }

    await this.lyriaClient.updateParameters({ genre });
    logger.info(`Genre changed to ${genre} by ${author}`);
  }

  /**
   * Handle !intensity command
   */
  private async handleIntensityCommand(args: string[], author: string): Promise<void> {
    const intensity = parseFloat(args[0]);
    if (isNaN(intensity) || intensity < 0 || intensity > 1) {
      logger.warn(`Invalid intensity from ${author}: ${args[0]}. Must be 0-1`);
      return;
    }

    await this.lyriaClient.updateParameters({ intensity });
    logger.info(`Intensity changed to ${intensity} by ${author}`);
  }

  /**
   * Handle !help command
   */
  private async handleHelpCommand(author: string): Promise<void> {
    const helpText = [
      'Available commands:',
      '  !bpm <40-200> - Change tempo',
      '  !mood <chill|energetic|focus|nostalgic> - Change mood',
      '  !genre <lo-fi|jazz|ambient|synthwave> - Change genre',
      '  !intensity <0-1> - Adjust intensity',
      '  !help - Show this help'
    ].join('\\n');

    logger.info(`Help requested by ${author}`);
    // In production, send this back to chat
  }

  /**
   * Set custom command handler
   */
  setCommandHandler(handler: ChatCommandHandler): void {
    this.onCommand = handler;
  }
}
