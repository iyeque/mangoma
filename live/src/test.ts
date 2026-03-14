/**
 * Simple connectivity test for Mangoma Live
 * Run with: npm run test
 */

import { WebSocket } from 'ws';
import { config } from './config.js';
import { getLogger } from './utils.js';

const logger = getLogger('test');

async function runTests() {
  logger.info('Starting Mangoma Live connectivity tests...');

  // 1. Test WebSocket connection
  logger.info('Testing WebSocket connection...');
  const wsUrl = `ws://${config.server.host}:${config.server.port}/live/stream`;
  
  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      logger.info('✓ WebSocket connected');
      ws.send(JSON.stringify({ type: 'ping' }));
      logger.info('✓ Ping sent');
    });

    ws.on('message', (data) => {
      if (data instanceof Buffer) {
        logger.info(`✓ Received binary data: ${data.length} bytes`);
      } else {
        try {
          const msg = JSON.parse(data.toString());
          logger.info(`✓ Received: ${JSON.stringify(msg)}`);
          if (msg.type === 'pong') {
            ws.close();
          }
        } catch (e) {
          logger.error('Failed to parse message:', e);
        }
      }
    });

    ws.on('close', () => {
      logger.info('✓ WebSocket closed cleanly');
      resolve();
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error:', error);
      reject(error);
    });

    setTimeout(() => {
      logger.error('Test timeout after 10s');
      ws.close();
      reject(new Error('Timeout'));
    }, 10000);
  });
}

// Run
runTests()
  .then(() => {
    logger.info('✅ All tests passed');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('❌ Tests failed:', error);
    process.exit(1);
  });
