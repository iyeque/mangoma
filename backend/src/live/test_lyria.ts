import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY!;
const model = 'models/lyria-realtime-exp';

async function test() {
  const ai = new GoogleGenAI({ apiKey });
  try {
    console.log('Attempting to connect to Lyria model:', model);
    const session = await ai.live.music.connect({
      model,
      callbacks: {
        onmessage: (e: MessageEvent) => {
          console.log('Message received:', typeof e.data === 'string' ? e.data.substring(0, 200) : e.data);
        },
        onerror: (e: ErrorEvent) => {
          console.error('Error event:', e.error);
        },
        onclose: () => {
          console.log('Connection closed');
        }
      }
    });
    console.log('Connected successfully to Lyria model');
    // Immediately stop and close
    await session.stop();
    await session.close();
    console.log('Test completed');
  } catch (error: any) {
    console.error('CONNECTION FAILED:', error.message);
    if (error.response) {
      console.error('HTTP status:', error.response.status);
      try {
        const body = await error.response.text();
        console.error('Response body:', body);
      } catch (e) {}
    } else {
      console.error('Error details:', error);
    }
    process.exit(1);
  }
}

test().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
