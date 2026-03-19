import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const config = {
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.LYRIA_MODEL || 'lyria-realtime-exp'
  },
  server: {
    port: parseInt(process.env.PORT || '8080', 10),
    host: process.env.HOST || 'localhost'
  },
  youtube: {
    rtmpUrl: process.env.YOUTUBE_RTMP_URL || 'rtmp://a.rtmp.youtube.com/live2',
    streamKey: process.env.YOUTUBE_STREAM_KEY || ''
  },
  audio: {
    sampleRate: parseInt(process.env.AUDIO_SAMPLE_RATE || '48000', 10),
    channels: parseInt(process.env.AUDIO_CHANNELS || '2', 10),
    bitrate: process.env.AUDIO_BITRATE || '192k'
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },
  presets: {
    dir: process.env.PRESETS_DIR || join(__dirname, 'presets')
  }
};

export type Config = typeof config;
