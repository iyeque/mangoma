/**
 * YouLive Chat Poller
 * 
 * Polls YouLive/YouTube Live Chat for viewer commands and triggers updates.
 * Supports commands: !bpm, !mood, !genre, !intensity, !visualize, !help
 * 
 * MVP Mode: Uses simulation to test functionality without YouTube API credentials.
 * Production: Requires YouTube Data API v3 with liveChatId from broadcast.
 */

import { getLogger } from './utils.js';
import type { LyriaClient } from './lyria_client.js';
import type { YouTubeRTMPStreamer } from './youtube_rtmp.js';

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
  useSimulation?: boolean; // MVP: true = simulate chat, false = use real API
  youtubeBroadcastId?: string; // For production YouTube API integration
  youtubeApiKey?: string; // YouTube Data API key
}

export type ChatCommandHandler = (command: string, args: string[], author: string) => Promise<void>;

export class ChatPoller {
  private enabled: boolean;
  private pollIntervalMs: number;
  private cooldownSeconds: number;
  private allowedCommands: string[];
  private lyriaClient: LyriaClient;
  private youtubeStreamer: YouTubeRTMPStreamer | null = null;
  private polling: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastCommandTime: Map<string, number> = new Map();
  private lastMessageId: string | null = null;
  private onCommand?: ChatCommandHandler;
  private useSimulation: boolean;
  private youtubeBroadcastId?: string;
  private youtubeApiKey?: string;
  
  // Simulation state
  private simulationCounter: number = 0;

  constructor(
    lyriaClient: LyriaClient,
    youtubeStreamer: YouTubeRTMPStreamer | null,
    options: ChatPollerOptions,
    onCommand?: ChatCommandHandler
  ) {
    this.lyriaClient = lyriaClient;
    this.youtubeStreamer = youtubeStreamer;
    this.enabled = options.enabled;
    this.pollIntervalMs = options.pollIntervalMs || 5000;
    this.cooldownSeconds = options.cooldownSeconds || 300;
    this.allowedCommands = options.allowedCommands || ['!bpm', '!mood', '!genre', '!intensity', '!visualize', '!help'];
    this.onCommand = onCommand;
    this.useSimulation = options.useSimulation ?? true; // Default to simulation for MVP
    this.youtubeBroadcastId = options.youtubeBroadcastId;
    this.youtubeApiKey = options.youtubeApiKey;
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

    logger.info(`Starting chat polling (mode: ${this.useSimulation ? 'simulation' : 'YouTube API'}, interval: ${this.pollIntervalMs}ms)`);
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
      const messages = await this.fetchChatMessages();
      
      for (const message of messages) {
        await this.processMessage(message);
      }
    } catch (error) {
      logger.error('Error polling chat:', error);
    }

    this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
  }

  /**
   * Fetch chat messages from YouTube Live or simulation
   */
  private async fetchChatMessages(): Promise<ChatMessage[]> {
    if (this.useSimulation) {
      return this.fetchSimulatedMessages();
    } else {
      return this.fetchYouTubeLiveChat();
    }
  }

  /**
   * Simulation mode: Generate test chat messages for MVP testing
   * Simulates random viewers sending commands
   */
  private fetchSimulatedMessages(): ChatMessage[] {
    const messages: ChatMessage[] = [];
    this.simulationCounter++;

    // Simulate a command every ~20 poll cycles (100 seconds at 5s interval)
    if (this.simulationCounter % 20 === 0) {
      const commands = [
        { cmd: '!bpm', args: ['90'], author: 'TestUser1' },
        { cmd: '!mood', args: ['energetic'], author: 'MusicFan22' },
        { cmd: '!intensity', args: ['0.8'], author: 'Listener99' },
        { cmd: '!genre', args: ['synthwave'], author: 'RetroVibe' },
        { cmd: '!help', args: [], author: 'NewViewer' },
        { cmd: '!visualize', args: ['on'], author: 'VisualFan' },
      ];
      
      const test = commands[Math.floor(Math.random() * commands.length)];
      messages.push({
        id: `sim_${Date.now()}_${Math.random()}`,
        author: test.author,
        text: `${test.cmd} ${test.args.join(' ')}`.trim(),
        timestamp: Date.now()
      });
    }

    // Occasionally simulate a non-command chat message
    if (this.simulationCounter % 15 === 0) {
      const chatMsgs = [
        'Love this beat!',
        'This is amazing',
        'Can we get some jazz?',
        'BPM 120 please!',
        'Great stream!',
        'What genre is this?',
        'Mood: chill is perfect'
      ];
      const msg = chatMsgs[Math.floor(Math.random() * chatMsgs.length)];
      messages.push({
        id: `sim_chat_${Date.now()}`,
        author: 'Viewer' + Math.floor(Math.random() * 1000),
        text: msg,
        timestamp: Date.now()
      });
    }

    return messages;
  }

  /**
   * Production: Fetch messages from YouTube Live Chat API
   * Requires: youtubeBroadcastId and youtubeApiKey set in options
   */
  private async fetchYouTubeLiveChat(): Promise<ChatMessage[]> {
    if (!this.youtubeBroadcastId || !this.youtubeApiKey) {
      logger.warn('YouTube API credentials not configured. Enable simulation mode or set YOUTUBE_BROADCAST_ID and YOUTUBE_API_KEY.');
      return [];
    }

    try {
      // Get live chat ID for the broadcast
      const broadcastUrl = `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=liveStreamingDetails&id=${this.youtubeBroadcastId}&key=${this.youtubeApiKey}`;
      
      const broadcastRes = await fetch(broadcastUrl);
      const broadcastData = await broadcastRes.json();
      
      if (!broadcastData.items || broadcastData.items.length === 0) {
        logger.warn('Broadcast not found or not live');
        return [];
      }
      
      const liveChatId = broadcastData.items[0].liveStreamingDetails.activeLiveChatId;
      if (!liveChatId) {
        logger.warn('No active live chat ID found');
        return [];
      }
      
      // Fetch chat messages
      const chatUrl = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${liveChatId}&part=snippet,authorDetails&key=${this.youtubeApiKey}`;
      
      const chatRes = await fetch(chatUrl);
      const chatData = await chatRes.json();
      
      const messages: ChatMessage[] = (chatData.items || []).map(item => ({
        id: item.id,
        author: item.authorDetails?.displayName || 'Unknown',
        text: item.snippet?.displayMessage || '',
        timestamp: Date.parse(item.snippet?.publishedAt) || Date.now()
      }));
      
      return messages;
      
    } catch (error) {
      logger.error('YouTube API error:', error);
      return [];
    }
  }

  /**
   * Process a chat message and check for commands
   */
  private async processMessage(message: ChatMessage): Promise<void> {
    // Skip if already seen
    if (this.lastMessageId === message.id) {
      return;
    }
    this.lastMessageId = message.id;

    const text = message.text.trim();
    
    // Add ALL chat messages to overlay (not just commands)
    if (this.youtubeStreamer) {
      this.youtubeStreamer.addChatMessage(message.author, text);
    }
    
    // Check if message starts with a command
    if (!text.startsWith('!')) {
      return;
    }

    const parts = text.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Check if command is allowed
    if (!this.allowedCommands.includes(command)) {
      logger.debug(`Unknown command: ${command}`);
      return;
    }

    // Check cooldown (except for !help which is always allowed)
    if (command !== '!help' && !this.checkCooldown(command, message.timestamp)) {
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
    // Update cooldown (except !help)
    if (command !== '!help') {
      this.lastCommandTime.set(command, Date.now());
    }

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
        case '!visualize':
          await this.handleVisualizeCommand(args, author);
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

    // Update Lyria parameters
    await this.lyriaClient.updateParameters({ bpm });
    
    // Update visualizer on streamer
    if (this.youtubeStreamer) {
      this.youtubeStreamer.updateVisualizerParams({ bpm });
    }
    
    logger.info(`BPM changed to ${bpm} by ${author}`);
  }

  /**
   * Handle !mood command - affects both Lyria and visualizer
   */
  private async handleMoodCommand(args: string[], author: string): Promise<void> {
    const mood = args[0]?.toLowerCase();
    const validMoods = ['chill', 'energetic', 'focus', 'nostalgic', 'happy', 'melancholic', 'dark', 'uplifting'];
    
    if (!mood || !validMoods.includes(mood)) {
      logger.warn(`Invalid mood from ${author}: ${args[0]}. Valid: ${validMoods.join(', ')}`);
      return;
    }

    await this.lyriaClient.updateParameters({ mood });
    
    if (this.youtubeStreamer) {
      this.youtubeStreamer.updateVisualizerParams({ mood });
    }
    
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
    
    if (this.youtubeStreamer) {
      this.youtubeStreamer.updateVisualizerParams({ intensity });
    }
    
    logger.info(`Intensity changed to ${intensity} by ${author}`);
  }

  /**
   * Handle !visualize command - toggle chat overlay on video
   */
  private async handleVisualizeCommand(args: string[], author: string): Promise<void> {
    const showChat = args[0] === 'on' || args[0] === 'true';
    
    if (this.youtubeStreamer) {
      this.youtubeStreamer.updateVisualizerParams({ showChat });
    }
    
    logger.info(`Visualizer chat overlay ${showChat ? 'enabled' : 'disabled'} by ${author}`);
  }

  /**
   * Handle !help command
   */
  private async handleHelpCommand(author: string): Promise<void> {
    const helpText = [
      'Available commands:',
      '  !bpm <40-200> - Change tempo (affects music)',
      '  !mood <chill|energetic|focus|nostalgic|happy|melancholic|dark|uplifting> - Change mood (affects music + visuals)',
      '  !genre <lo-fi|jazz|ambient|synthwave|electronic|classical|hip-hop|rock> - Change music genre',
      '  !intensity <0-1> - Adjust intensity (affects music + visualizer)',
      '  !visualize on/off - Toggle chat overlay on video',
      '  !help - Show this help'
    ].join('\n');

    logger.info(`Help sent to ${author}: ${helpText}`);
    // In production, send this as a chat message back to the user
    // For now, we just log it
  }

  /**
   * Set custom command handler
   */
  setCommandHandler(handler: ChatCommandHandler): void {
    this.onCommand = handler;
  }
}
