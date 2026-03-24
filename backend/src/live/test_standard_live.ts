import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY!;

async function test() {
  const ai = new GoogleGenAI({ apiKey });
  try {
    console.log('Testing standard live connect (gemini-2.0-flash-live-preview)');
    const session = await ai.live.connect({
      model: 'gemini-2.0-flash-live-preview-04-09',
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
    console.log('Standard live connected OK');
    await session.send({ text: 'Hello' });
    // Wait a bit for response
    await new Promise(res => setTimeout(res, 3000));
    await session.close();
    console.log('Test completed');
  } catch (error: any) {
    console.error('FAILED:', error.message);
    if (error.response) {
      console.error('HTTP status:', error.response.status);
    }
    process.exit(1);
  }
}

test().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
