/**
 * Dummy Music Provider – generates simple sine wave tones via FFmpeg
 * Useful for testing the streaming pipeline without external ML dependencies.
 */

import { IMusicProvider } from './music_client.js';
import { execSync, spawn } from 'child_process';

const AUDIO_SAMPLE_RATE = 48000;
const AUDIO_CHANNELS = 2;

// Cache generated tone per duration
const toneCache = new Map<number, Buffer>();

async function generateTone(duration: number): Promise<Buffer> {
  if (toneCache.has(duration)) {
    return toneCache.get(duration)!;
  }

  // Use FFmpeg to generate a 440Hz sine wave for the given duration
  const args = [
    '-f', 'lavfi',
    '-i', `sine=frequency=440:duration=${duration}`,
    '-ac', `${AUDIO_CHANNELS}`,
    '-ar', `${AUDIO_SAMPLE_RATE}`,
    '-c:a', 'pcm_s16le',
    '-f', 'wav',
    'pipe:1'
  ];

  const wav = execSync('ffmpeg ' + args.join(' '), { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 });
  toneCache.set(duration, wav);
  return wav;
}

export class DummyProvider implements IMusicProvider {
  async connect(): Promise<void> {
    // nothing to connect
  }

  async generateChunk(prompt: string, duration: number): Promise<Buffer> {
    // Ignore prompt, just generate tone
    return generateTone(duration);
  }

  async stop(): Promise<void> {}

  async isHealthy(): Promise<boolean> {
    try {
      execSync('ffmpeg -version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
