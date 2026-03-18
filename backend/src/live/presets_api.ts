import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { join, extname, basename } from 'path';
import { config } from './config.js';

export interface Preset {
  id: string;
  name: string;
  description?: string;
  lyria: {
    model?: string;
    params: {
      bpm?: number;
      mood?: string;
      genre?: string;
      intensity?: number;
      temperature?: number;
    };
  };
  youtube: {
    streamKey?: string; // If empty, use from config
    title: string;
    description: string;
    tags: string[];
    privacy: 'public' | 'private' | 'unlisted';
    chatEnabled: boolean;
    chatModeration?: {
      autoMod: boolean;
      blockedTerms?: string[];
      slowMode?: number;
    };
  };
  interaction: {
    chatCommands?: Record<string, string>;
    realtimeAdjustments: {
      enabled: boolean;
      parameters: string[];
      cooldownSeconds: number;
    };
  };
  audio: {
    sampleRate: number;
    channels: number;
    outputBitrate: string;
  };
  createdAt: string;
  updatedAt: string;
}

export class PresetsAPI {
  private presetsDir: string;

  constructor(presetsDir?: string) {
    this.presetsDir = presetsDir || config.presets.dir;
  }

  async ensureDir(): Promise<void> {
    try {
      await mkdir(this.presetsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  private getPresetPath(id: string): string {
    return join(this.presetsDir, `${id}.json`);
  }

  async list(): Promise<Preset[]> {
    await this.ensureDir();
    const files = await readdir(this.presetsDir);
    const presets: Preset[] = [];

    for (const file of files) {
      if (extname(file) === '.json') {
        const id = basename(file, '.json');
        try {
          const preset = await this.load(id);
          if (preset) {
            presets.push(preset);
          }
        } catch (error) {
          console.error(`Failed to load preset ${id}:`, error);
        }
      }
    }

    return presets.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async load(id: string): Promise<Preset | null> {
    try {
      const filePath = this.getPresetPath(id);
      const data = await readFile(filePath, 'utf-8');
      return JSON.parse(data) as Preset;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async save(id: string, data: Partial<Preset>): Promise<Preset> {
    await this.ensureDir();

    // Load existing if present to preserve createdAt
    const existing = await this.load(id);
    const now = new Date().toISOString();

    const preset: Preset = {
      id,
      name: data.name || id,
      description: data.description || '',
      lyria: {
        model: data.lyria?.model || config.gemini.model,
        params: {
          bpm: data.lyria?.params?.bpm || 70,
          mood: data.lyria?.params?.mood || 'chill',
          genre: data.lyria?.params?.genre || 'lo-fi',
          intensity: data.lyria?.params?.intensity || 0.7,
          temperature: data.lyria?.params?.temperature || 0.7
        }
      },
      youtube: {
        streamKey: data.youtube?.streamKey || config.youtube.streamKey,
        title: data.youtube?.title || `Live Stream - ${id}`,
        description: data.youtube?.description || 'Automated live stream powered by Mangoma',
        tags: data.youtube?.tags || ['lofi', 'live', 'music'],
        privacy: data.youtube?.privacy || 'private',
        chatEnabled: data.youtube?.chatEnabled !== false,
        chatModeration: data.youtube?.chatModeration || { autoMod: false }
      },
      interaction: {
        chatCommands: data.interaction?.chatCommands || {
          '!bpm': 'Change BPM (e.g., !bpm 80)',
          '!mood': 'Change mood (chill, energetic, focus)',
          '!genre': 'Change genre (lofi, jazz, ambient)'
        },
        realtimeAdjustments: {
          enabled: data.interaction?.realtimeAdjustments?.enabled ?? true,
          parameters: data.interaction?.realtimeAdjustments?.parameters || ['bpm', 'mood', 'intensity'],
          cooldownSeconds: data.interaction?.realtimeAdjustments?.cooldownSeconds || 300
        }
      },
      audio: {
        sampleRate: data.audio?.sampleRate || config.audio.sampleRate,
        channels: data.audio?.channels || config.audio.channels,
        outputBitrate: data.audio?.outputBitrate || config.audio.bitrate
      },
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    const filePath = this.getPresetPath(id);
    await writeFile(filePath, JSON.stringify(preset, null, 2));
    return preset;
  }

  async delete(id: string): Promise<void> {
    const filePath = this.getPresetPath(id);
    try {
      await unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
