import express from 'express';
import cors from 'cors';
import http from 'http'; // Import http
import WebSocket from 'ws'; // Import WebSocket
import visualRoutes from './routes/visualRoutes';


// Check required environment variables
const requiredEnvVars = [
    'GEMINI_API_KEY'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the 'storage' directory


// Routes
app.use('/api', visualRoutes);

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ noServer: true });

// Handle WebSocket upgrade requests
server.on('upgrade', (request, socket, head) => {
    if (request.url === '/api/gemini') { // Our proxy endpoint
        wss.handleUpgrade(request, socket, head, ws => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

// WebSocket proxy logic
wss.on('connection', ws => {
    console.log('Client connected to /api/gemini WebSocket');

    // Forward client WebSocket connection to Google GenAI API
    // The actual Google GenAI Live Music API WebSocket URL
    // This should ideally be configurable or derived from the SDK.
    // For now, I'll use a placeholder.
    // The SDK's `connect` method will handle the full URL.
    // We just need to proxy the connection.
    const geminiApiUrl = `wss://generativelanguage.googleapis.com/v1beta/models/lyria-realtime-exp:generateLiveMusic?key=${process.env.GEMINI_API_KEY}`;
    const geminiWs = new WebSocket(geminiApiUrl);

    geminiWs.onopen = () => {
        console.log('Connected to Google GenAI WebSocket');
    };

    geminiWs.onmessage = message => {
        // Forward messages from Google GenAI to client
        ws.send(message.data);
    };

    geminiWs.onerror = error => {
        console.error('Google GenAI WebSocket error:', error);
        ws.close();
    };

    geminiWs.onclose = () => {
        console.log('Google GenAI WebSocket closed');
        ws.close();
    };

    ws.onmessage = message => {
        // Forward messages from client to Google GenAI
        geminiWs.send(message.data);
    };

    ws.onerror = error => {
        console.error('Client WebSocket error:', error);
        geminiWs.close();
    };

    ws.onclose = () => {
        console.log('Client WebSocket closed');
        geminiWs.close();
    };
});


// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Internal Server Error'
    });
});

// Start server (use http server, not express app directly)
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down server...');
    server.close(() => { // Close http server
        console.log('HTTP server closed.');
        process.exit(0);
    });
});
