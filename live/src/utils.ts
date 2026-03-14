import { createLogger, format, transports, Logger } from 'winston';

export function getLogger(name: string): Logger {
  return createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      format.errors({ stack: true }),
      format.splat(),
      format.json()
    ),
    defaultMeta: { service: name },
    transports: [
      new transports.Console({
        format: format.combine(
          format.colorize(),
          format.printf(({ timestamp, level, message, service, ...meta }) => {
            return `${timestamp} [${service}] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
          })
        )
      })
    ]
  });
}

/**
 * Helper to convert Buffer to Float32Array (PCM samples)
 * Assumes 16-bit signed integer PCM input
 */
export function bufferToFloat32(buffer: Buffer): Float32Array {
  const float32 = new Float32Array(buffer.length / 2);
  let offset = 0;
  for (let i = 0; i < buffer.length; i += 2) {
    const int16 = buffer.readInt16LE(i);
    float32[offset++] = int16 / 32768.0; // normalize to [-1, 1]
  }
  return float32;
}

/**
 * Convert Float32Array to Buffer (PCM 16-bit LE)
 */
export function float32ToBuffer(float32: Float32Array): Buffer {
  const buffer = Buffer.alloc(float32.length * 2);
  let offset = 0;
  for (let i = 0; i < float32.length; i++) {
    const int16 = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32768)));
    buffer.writeInt16LE(int16, offset);
    offset += 2;
  }
  return buffer;
}

/**
 * Generate a simple WAV header for raw PCM data
 */
export function createWavHeader(sampleRate: number, channels: number, bitsPerSample: number, dataLength: number): Buffer {
  const buffer = Buffer.alloc(44);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // audio format (1 = PCM)
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  return buffer;
}
