# Visualizer Testing Guide

## Prerequisites

- Node.js 18+ installed
- FFmpeg in PATH (`ffmpeg -version` should work)
- Google Gemini API key with Lyria access
- (Optional) YouTube stream key for real RTMP testing

## Quick Start

1. **Install dependencies**
```bash
cd /home/iyeque/.openclaw/workspace/mangoma/backend
npm install
```

2. **Configure environment**
```bash
cp .env.example .env
# Edit .env and add:
# GEMINI_API_KEY=your_key_here
# (Optionally) YOUTUBE_STREAM_KEY=your_key_here
```

3. **Start development server**
```bash
npm run dev
```

4. **Open dashboard**
```
http://localhost:8080
```

---

## Testing BPM Pulse Effect

### Test 1: Basic Streaming
1. Click "Connect WebSocket"
2. Select preset "default-lofi-study" (BPM=70)
3. Click "Load Preset", then "Start Stream"
4. **Observe:**
   - YouTube preview should show colored background with waveform
   - Waveform should react to music
   - Chat overlay (empty) is not visible

### Test 2: BPM Change
1. While streaming, adjust BPM slider:
   - Set to **60 BPM** → Slow, gentle pulse
   - Set to **140 BPM** → Fast, energetic pulse
   - Set to **90 BPM** → Medium pulse
2. **Verify:**
   - Pulse frequency increases with BPM
   - Waveform sample density increases (sharper peaks at high BPM)
   - If mood is energetic/dark, expanding circle pulses faster

### Test 3: Intensity Impact
1. Adjust intensity slider from 0.1 to 0.9
2. **Verify:**
   - Lower intensity: subtler pulse, less opaque waveform
   - Higher intensity: stronger pulse, more opaque waveform
   - Background tint opacity changes

### Test 4: Mood Switching
1. Switch moods and observe color changes:
   - **chill** → Blue theme, overlay blend mode
   - **energetic** → Red/orange theme, circle pulse appears
   - **focus** → Green theme, overlay blend
   - **dark** → Black background, white text
2. **Verify:**
   - Primary/secondary/background colors update immediately
   - Chat text color adjusts for readability (white on dark backgrounds)

---

## Testing Chat Overlay

### Test 5: Simulated Chat Commands
The ChatPoller runs in simulation mode by default. It randomly sends commands every ~100 seconds.

**To see immediate effect:**

Send a WebSocket command (using browser console or test tool):
```javascript
const ws = new WebSocket('ws://localhost:8080/live/stream');
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'chat_command',
    command: '!bpm',
    args: ['120'],
    author: 'Tester'
  }));
};
```

Or use the dashboard's parameter sliders (they send `/api/stream/update`).

**Verify:**
1. Command appears in chat overlay (bottom of video)
2. Command text is **bold** (`!bpm` highlighted)
3. Visualizer parameters update (BPM changes → pulse speed changes)
4. Lyria music tempo changes (after a few seconds)

### Test 6: Multiple Chat Messages
1. Send 3 different commands quickly
2. **Verify:**
   - Last 3 messages displayed
   - Background box accommodates 3 lines
   - Text is readable over dynamic background

---

## Simulating YouTube Live Chat

To test the actual YouTube polling (requires OAuth2):

1. Set in code or env:
   ```
   YOUTUBE_BROADCAST_ID=your_live_broadcast_id
   YOUTUBE_API_KEY=your_api_key
   ```

2. In `server.ts` or create poller with `useSimulation: false`

3. Restart server

4. In your YouTube live stream chat, type `!bpm 100`

5. **Verify:**
   - Command appears in dashboard log
   - BPM updates within 5-10 seconds
   - Visualizer syncs

---

## Expected Visual Output

### At 70 BPM (chill mood)
- Background: Dark blue (#0c2461)
- Pulse: Slow breathing (~1.17 Hz)
- Waveform: Blue lines, smooth, overlay blend
- Text: Black on light background

### At 140 BPM (energetic mood)
- Background: Dark red (#922b21)
- Pulse: Fast (~2.33 Hz)
- Circle: Orange expanding from center at same frequency
- Waveform: Red lines, dense samples, screen blend
- Text: White on dark background

---

## Troubleshooting

### No visualizer appears (black screen)
- Check FFmpeg logs in server console
- Ensure `ffmpeg` is in PATH
- Verify width/height are positive integers
- Look for filter graph errors in stderr

### Chat overlay not showing
- Ensure `showChat: true` (default)
- Add chat messages via `youtubeStreamer.addChatMessage()`
- Check FFmpeg drawtext filter syntax in logs

### BPM changes not affecting visualizer
- Confirm `updateVisualizerParams()` called
- Check that `config.bpm` is within 40-200
- Verify FFmpeg filter graph includes `pulse` stage

### Commands not working
- Check WebSocket connection status
- Look for `Chat command:` log entries
- Verify cooldown period (default 300s) hasn't blocked repeat commands

---

## Performance Benchmarks (Expected)

- **FFmpeg CPU:** ~5-10% on modern 4-core CPU
- **End-to-end latency:** 100-200ms (Lyria generation adds ~1-2s)
- **Memory:** ~50MB total (Node + FFmpeg)
- **Stability:** Should run 24/7 without restart

---

## Production Checklist

Before going live:

- [ ] Test with real YouTube stream key (unlisted)
- [ ] Set up OAuth2 for YouTube Live Chat API
- [ ] Configure cooldown (`cooldownSeconds`) to prevent spam
- [ ] Set `maxChatMessages` to reasonable number (10-20)
- [ ] Add monitoring for FFmpeg crashes (auto-restart)
- [ ] Test with varied audio (different genres, tempos)
- [ ] Verify chat overlay doesn't obscure important visual elements
- [ ] Test rate limiting on YouTube API (5-10s polling interval)

---

**Questions?** Refer to `docs/LIVE_STREAMING.md` for full architecture and API docs.
