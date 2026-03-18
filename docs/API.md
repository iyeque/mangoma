# Mangoma Live API Reference

## Base URL

```
http://localhost:8080
```

## Authentication

Currently, no authentication is implemented. In production, consider adding API keys or OAuth.

## REST Endpoints

### Health Check

```http
GET /health
```

Returns the health status of the server.

**Response:**
```json
{
  "status": "ok",
  "uptime": 1234.56,
  "connections": 1,
  "streaming": false,
  "generating": false
}
```

### Presets

#### List Presets

```http
GET /api/presets
```

Returns an array of all available presets.

**Response:**
```json
{
  "presets": [
    {
      "id": "default-lofi-study",
      "name": "Lo-Fi Study Session",
      "description": "Chill lo-fi beats...",
      "lyria": {
        "model": "lyria-realtime-exp",
        "params": { "bpm": 70, "mood": "chill", ... }
      },
      "youtube": { ... },
      "interaction": { ... },
      "audio": { ... },
      "createdAt": "2026-03-14T00:00:00.000Z",
      "updatedAt": "2026-03-14T00:00:00.000Z"
    }
  ]
}
```

#### Get Preset

```http
GET /api/presets/:id
```

Returns a single preset.

**Response:** Same as preset object above, or 404 if not found.

#### Save Preset

```http
POST /api/presets
Content-Type: application/json

{
  "id": "my-preset",
  "name": "My preset",
  "lyria": { "params": { "bpm": 80, "mood": "chill", "genre": "ambient", "intensity": 0.6 } },
  "youtube": {
    "title": "My Stream",
    "description": "Description",
    "tags": ["ambient", "study"],
    "privacy": "private",
    "chatEnabled": true
  },
  "interaction": {
    "realtimeAdjustments": { "enabled": true, "cooldownSeconds": 300 }
  }
}
```

**Response:** The saved preset object.

**Note:** `createdAt` is auto-set on first save; `updatedAt` is updated on every save.

#### Delete Preset

```http
DELETE /api/presets/:id
```

**Response:**
```json
{ "message": "Preset deleted" }
```

### Stream Control

#### Start Stream

```http
POST /api/stream/start
Content-Type: application/json

{
  "presetId": "default-lofi-study"
}
```

Or with a custom prompt:

```json
{
  "customPrompt": "Continuous jazz music with upbeat tempo"
}
```

**Response:**
```json
{
  "status": "streaming",
  "preset": "default-lofi-study",
  "prompt": "Generate continuous lo-fi music with chill mood...",
  "message": "Continuous music generation started"
}
```

**Behavior:**
- Stops any existing stream
- Loads preset or uses custom prompt
- Connects to Lyria and begins continuous generation
- Starts FFmpeg RTMP stream to YouTube
- Starts chat poller if enabled

#### Stop Stream

```http
POST /api/stream/stop
```

**Response:**
```json
{ "status": "stopped", "message": "Stream stopped successfully" }
```

**Behavior:**
- Stops Lyria generation
- Stops chat poller
- Stops FFmpeg and closes RTMP connection

#### Update Parameters

```http
POST /api/stream/update
Content-Type: application/json

{
  "bpm": 85,
  "mood": "energetic",
  "genre": "synthwave",
  "intensity": 0.8,
  "temperature": 0.9
}
```

**Response:**
```json
{
  "status": "updated",
  "params": { "bpm": 85, "mood": "energetic", ... }
}
```

All parameters are optional; only provided ones are updated.

#### Get Stream Status

```http
GET /api/stream/status
```

**Response:**
```json
{
  "streaming": true,
  "generating": true,
  "preset": "default-lofi-study",
  "prompt": "Generate continuous lo-fi music...",
  "params": { "bpm": 70, "mood": "chill", "genre": "lo-fi", "intensity": 0.6 },
  "connections": 2,
  "lyria": {
    "connected": true,
    "model": "lyria-realtime-exp"
  }
}
```

## WebSocket

### Connection

Connect to `/live/stream`:

```javascript
const ws = new WebSocket('ws://localhost:8080/live/stream');
```

### Messages

All WebSocket messages are JSON objects with a `type` field.

#### Incoming (from server)

##### Connected

```json
{
  "type": "connected",
  "clientId": "127.0.0.1",
  "timestamp": 1710739200000,
  "preset": "default-lofi-study",
  "generating": false,
  "params": {},
  "message": "Connected to Mangoma Live control..."
}
```

##### Parameters Updated

```json
{
  "type": "parameters_updated",
  "params": { "bpm": 85 },
  "currentParams": { "bpm": 85, "mood": "chill", ... }
}
```

##### Preset Loaded

```json
{
  "type": "preset_loaded",
  "preset": "default-lofi-study"
}
```

##### Status Response

```json
{
  "type": "status",
  "streaming": true,
  "generating": true,
  "preset": "default-lofi-study",
  "params": { "bpm": 70, ... }
}
```

##### Error

```json
{
  "type": "error",
  "message": "Unknown command: foo"
}
```

#### Outgoing (to server)

##### Ping

```json
{ "type": "ping" }
```

Server responds with `{ "type": "pong", "timestamp": ... }`.

##### Load Preset

```json
{
  "type": "preset",
  "presetId": "default-lofi-study"
}
```

##### Update Parameters

```json
{
  "type": "update",
  "bpm": 85,
  "mood": "energetic"
}
```

##### Simulate Chat Command (for testing)

```json
{
  "type": "chat_command",
  "command": "!bpm",
  "args": ["85"],
  "author": "testuser"
}
```

##### Request Status

```json
{
  "type": "status"
}
```

## Error Handling

All REST errors return a JSON body:

```json
{
  "error": "Descriptive error message",
  "details": "Optional detailed error information"
}
```

With appropriate HTTP status codes:
- 400: Bad request (missing parameters)
- 404: Not found (preset doesn't exist)
- 500: Internal server error (Lyria, FFmpeg, etc.)

WebSocket errors are sent as messages with `type: "error"`.

## Rate Limits

Currently none are enforced on the API. In production:
- Parameter updates may be limited (cooldown from preset)
- Preset list may be cached
- Chat commands are rate-limited separately (see preset `interaction.realtimeAdjustments.cooldownSeconds`)

## Future Enhancements

- Authentication middleware
- WebSocket binary audio streaming (optional for monitoring)
- Multi-user session management
- Chat command customizations
- Metrics and monitoring endpoints
- YouTube status callbacks (start/end of stream)
