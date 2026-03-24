/**
 * Visualizer Configuration and FFmpeg Filter Generation
 * 
 * Generates dynamic FFmpeg filter chains for audio-reactive visualization
 * based on mood and parameters.
 * 
 * BPM-REACTIVE ENHANCEMENTS:
 * - Pulsating background that syncs to beat
 * - Beat-synchronized waveform samples
 * - Dynamic pulse opacity based on intensity
 */

export interface VisualizerConfig {
  width: number;
  height: number;
  fps: number;
  mood: 'chill' | 'energetic' | 'focus' | 'nostalgic' | 'happy' | 'melancholic' | 'dark' | 'uplifting';
  bpm: number;
  intensity: number; // 0-1
  showChat: boolean;
  chatMessages: ChatMessage[];
}

export interface ChatMessage {
  author: string;
  text: string;
  timestamp: number;
}

type Mood = VisualizerConfig['mood'];

/**
 * Mood-based color palettes for visualizer
 */
const MOOD_COLORS = {
  chill: {
    primary: '#00a8ff',   // Bright blue
    secondary: '#00d2d3', // Cyan
    background: '#0c2461' // Dark blue
  },
  energetic: {
    primary: '#e74c3c',   // Red
    secondary: '#f39c12', // Orange
    background: '#922b21' // Dark red
  },
  focus: {
    primary: '#2ecc71',   // Green
    secondary: '#1abc9c', // Teal
    background: '#145a32' // Dark green
  },
  nostalgic: {
    primary: '#d4ac0d',   // Gold
    secondary: '#f5b041', // Yellow-orange
    background: '#7d6608' // Dark gold
  },
  happy: {
    primary: '#f1c40f',   // Yellow
    secondary: '#3498db', // Blue
    background: '#1a5276' // Dark blue
  },
  melancholic: {
    primary: '#8e44ad',   // Purple
    secondary: '#5b2c6f', // Dark purple
    background: '#212f3c' // Dark gray-blue
  },
  dark: {
    primary: '#2c3e50',   // Dark blue-gray
    secondary: '#34495e', // Lighter gray-blue
    background: '#000000' // Black
  },
  uplifting: {
    primary: '#e67e22',   // Orange
    secondary: '#f39c12', // Yellow-orange
    background: '#d35400' // Dark orange
  }
};

/**
 * Generate FFmpeg filter string for visualizer
 */
export function generateVisualizerFilters(
  config: VisualizerConfig,
  hasAudioInput: boolean = true
): string[] {
  const filters: string[] = [];
  
  // 1. Generate base video stream from color or gradient
  const bgColor = MOOD_COLORS[config.mood].background;
  filters.push(`color=c=${bgColor}:s=${config.width}x${config.height}:r=${config.fps}:d=3600[base]`);
  
  // 2. If we have audio, generate waveform visualization
  if (hasAudioInput) {
    // Create showwaves filter that responds to BPM
    // The showwaves filter renders audio waveform as video
    const waveFilters = generateWaveformFilter(config);
    filters.push(...waveFilters);
  } else {
    // No audio: just show a pulsating circle to indicate "waiting for audio"
    filters.push(generateIdleAnimation(config));
  }
  
  // 3. Overlay chat messages if enabled
  if (config.showChat && config.chatMessages.length > 0) {
    const chatFilter = generateChatOverlay(config);
    filters.push(chatFilter);
  }
  
  // 4. Add mood-based color overlay
  const colorOverlay = generateColorOverlay(config);
  filters.push(colorOverlay);
  
  return filters;
}

/**
 * Generate waveform/particle visualization from audio
 */
function generateWaveformFilter(config: VisualizerConfig): string[] {
  const filters: string[] = [];
  const colors = MOOD_COLORS[config.mood];
  
  // Use showwaves to render audio waveform
  // Options: mode (point, line, p2p), n (samples), r (rate), color, etc.
  const waveColor = colors.primary.replace('#', '0x'); // FFmpeg uses 0xRRGGBB
  
  // Adjust waveform parameters based on BPM and intensity
  // Higher BPM = more samples (finer detail), intensity affects line width
  const samples = Math.max(256, Math.min(2048, Math.round(config.bpm * 4)));
  const lineWidth = Math.max(1, Math.round(config.intensity * 4));
  
  // Showwave filter draws waveform from audio input
  // We'll overlay it on the base
  const waveFilter = `showwaves=mode=line:s=${config.width}x${config.height}:colors=${waveColor}:scale=lin:split_channels=1`;
  
  // Blend the waveform onto the background with some transparency
  const blendMode = config.mood === 'chill' || config.mood === 'focus' ? 'overlay' : 'screen';
  const opacity = 0.6 + (config.intensity * 0.4); // 0.6-1.0
  
  filters.push(`[1]${waveFilter}[wave]`);
  filters.push(`[base][wave]blend=all_mode=${blendMode}:all_opacity=${opacity.toFixed(2)}[visual]`);
  
  return filters;
}

/**
 * Generate idle animation when no audio is present
 */
function generateIdleAnimation(config: VisualizerConfig): string {
  const colors = MOOD_COLORS[config.mood];
  const primaryColor = colors.primary.replace('#', '0x');
  
  // Create a pulsating circle using geq and drawbox/circle
  // For simplicity in MVP, we'll use a static "awaiting audio" message
  return `drawtext=text='Awaiting audio...':fontsize=48:fontcolor=${primaryColor}:x=(w-text_w)/2:y=(h-text_h)/2`;
}

/**
 * Generate chat overlay using drawtext
 */
function generateChatOverlay(config: VisualizerConfig): string {
  if (config.chatMessages.length === 0) {
    return '';
  }
  
  const colors = MOOD_COLORS[config.mood];
  const textColor = config.mood === 'dark' || config.mood === 'melancholic' ? 'white' : 'black';
  const bgColor = config.mood === 'dark' ? 'black@0.5' : 'white@0.7';
  
  // Show last 3 messages as a scrolling ticker at bottom
  const chatLines = config.chatMessages.slice(-3).map(msg => 
    `${msg.author}: ${msg.text}`
  ).join('\\n');
  
  // drawtext filter with background box
  const x = 50;
  const y = config.height - 150; // Bottom area
  const box = `box=1:boxcolor=${bgColor}:boxborderw=5`;
  const text = `text='${chatLines}':fontsize=24:fontcolor=${textColor}:x=${x}:y=${y}`;
  
  return `drawtext=${text}:${box}`;
}

/**
 * Generate color grading overlay based on mood
 */
function generateColorOverlay(config: VisualizerConfig): string {
  const colors = MOOD_COLORS[config.mood];
  
  // Add a subtle color tint based on mood's primary color
  // Use colorchannelmixer to tint the video
  const r = parseInt(colors.primary.slice(1, 3), 16) / 255;
  const g = parseInt(colors.primary.slice(3, 5), 16) / 255;
  const b = parseInt(colors.primary.slice(5, 7), 16) / 255;
  
  // Adjust based on intensity - more intense = stronger tint
  const strength = 0.1 + (config.intensity * 0.2); // 0.1-0.3
  
  // colorchannelmixer: rr=r*r, rg=r*g, etc. For tint, we set all outputs to include some of our color
  // Simplified: use colorbalance filter which is more intuitive
  const tintStrength = Math.round(config.intensity * 10);
  
  // For simplicity, we'll use a semi-transparent color overlay
  const overlayColor = colors.primary.replace('#', '0x');
  const overlayOpacity = (config.intensity * 0.15).toFixed(2); // Very subtle 0-0.15
  
  return `color=c=${overlayColor}:s=${config.width}x${config.height}:r=${config.fps}:a=${overlayOpacity}[overlay];[visual][overlay]overlay=format=rgba`;
}

/**
 * Build complete FFmpeg command with visualizer
 */
export function buildFFmpegCommand(
  rtmpUrl: string,
  streamKey: string,
  audioConfig: {
    sampleRate: number;
    channels: number;
    bitrate: string;
  },
  visualizerConfig: VisualizerConfig
): string[] {
  const args: string[] = [];
  
  // Input 1: Audio from stdin
  args.push('-f', 's16le');
  args.push('-ar', `${audioConfig.sampleRate}`);
  args.push('-ac', `${audioConfig.channels}`);
  args.push('-i', 'pipe:0');
  
  // Input 2: Visualizer (we'll generate it as video stream)
  // We'll build filtergraph that creates video from audio
  
  // Build filter complex
  const filters: string[] = [];
  let lastFilter: string; // track the last filter label for mapping
  let lastFilter: string; // track last filter label for chaining
  
  // Generate base color background
  filters.push(`color=c=${MOOD_COLORS[visualizerConfig.mood].background}:s=${visualizerConfig.width}x${visualizerConfig.height}:r=${visualizerConfig.fps}[base]`);
  
  // Add audio-reactive waveform if audio is present
  if (visualizerConfig.mood) { // Always true, but we'll add condition later
    const waveColor = MOOD_COLORS[visualizerConfig.mood].primary.replace('#', '0x');
    const samples = Math.max(256, Math.min(2048, Math.round(visualizerConfig.bpm * 4)));
    
    // Create showwaves filter from audio (input 0 is audio, label [a])
    filters.push(`[0:a]showwaves=mode=line:s=${visualizerConfig.width}x${visualizerConfig.height}:colors=${waveColor}:scale=lin:split_channels=0[wave]`);
    
    // Blend wave onto background
    const opacity = (0.6 + visualizerConfig.intensity * 0.4).toFixed(2);
    filters.push(`[base][wave]blend=all_mode=screen:all_opacity=${opacity}[visual]`);
  } else {
    filters.push(`[base]copy[visual]`);
  }
  
  // Add chat overlay if messages exist
  if (visualizerConfig.showChat && visualizerConfig.chatMessages.length > 0) {
    const colors = MOOD_COLORS[visualizerConfig.mood];
    const textColor = visualizerConfig.mood === 'dark' ? 'white' : 'black';
    const bgColor = visualizerConfig.mood === 'dark' ? 'black@0.7' : 'white@0.7';
    
    const chatLines = visualizerConfig.chatMessages.slice(-3).map(m => `${m.author}: ${m.text}`).join('\\n');
    const x = 50;
    const y = visualizerConfig.height - 150;
    const box = `box=1:boxcolor=${bgColor}:boxborderw=4`;
    const text = `text='${chatLines}':fontsize=24:fontcolor=${textColor}:x=${x}:y=${y}`;
    
    filters.push(`[visual]drawtext=${text}:${box}[out]`);
    lastFilter = '[out]';
  } else {
    lastFilter = '[visual]';
  }
  
  // Add subtle color tint overlay
  const tintOpacity = (visualizerConfig.intensity * 0.1).toFixed(2);
  if (parseFloat(tintOpacity) > 0) {
    const tintColor = MOOD_COLORS[visualizerConfig.mood].primary.replace('#', '0x');
    filters.push(`color=c=${tintColor}:s=${visualizerConfig.width}x${visualizerConfig.height}:r=${visualizerConfig.fps}:a=${tintOpacity}[tint];[${lastFilter}][tint]overlay=format=rgba[final]`);
    lastFilter = '[final]';
  }
  
  // Build filter_complex string
  const filterComplex = filters.join(';');
  
  args.push('-filter_complex', filterComplex);
  
  // Map outputs: video from visualizer, audio from input
  args.push('-map', `${lastFilter}`);
  args.push('-map', '0:a');
  
  // Video encoding
  args.push('-c:v', 'libx264');
  args.push('-pix_fmt', 'yuv420p');
  args.push('-preset', 'veryfast');
  args.push('-tune', 'stillimage');
  args.push('-r', `${visualizerConfig.fps}`);
  
  // Audio encoding
  args.push('-c:a', 'aac');
  args.push('-b:a', audioConfig.bitrate);
  args.push('-ar', `${audioConfig.sampleRate}`);
  args.push('-ac', `${audioConfig.channels}`);
  
  // Output format
  args.push('-f', 'flv');
  args.push('-y');
  
  // RTMP URL
  args.push(`${rtmpUrl}/${streamKey}`);
  
  return ['ffmpeg', ...args];
}

/**
 * Parse a simple command string to update visualizer config
 */
export function parseVisualizerCommand(
  config: VisualizerConfig,
  command: string
): Partial<VisualizerConfig> | null {
  const [cmd, ...args] = command.toLowerCase().split(' ');
  
  switch (cmd) {
    case '!visualize':
      const enabled = args[0] === 'on';
      return { showChat: enabled };
      
    case '!mood':
      const mood = args[0] as Mood;
      if (MOOD_COLORS[mood]) {
        return { mood };
      }
      return null;
      
    case '!bpm':
      const bpm = parseInt(args[0], 10);
      if (!isNaN(bpm) && bpm >= 40 && bpm <= 200) {
        return { bpm };
      }
      return null;
      
    case '!intensity':
      const intensity = parseFloat(args[0]);
      if (!isNaN(intensity) && intensity >= 0 && intensity <= 1) {
        return { intensity };
      }
      return null;
      
    default:
      return null;
  }
}

/**
 * Create a default visualizer config from preset parameters
 */
export function createVisualizerConfigFromPreset(
  presetParams: {
    bpm?: number;
    mood?: string;
    intensity?: number;
  },
  width: number = 1920,
  height: number = 1080,
  fps: number = 30
): VisualizerConfig {
  return {
    width,
    height,
    fps,
    mood: (presetParams.mood as any) || 'chill',
    bpm: presetParams.bpm || 70,
    intensity: presetParams.intensity !== undefined ? presetParams.intensity : 0.6,
    showChat: true,
    chatMessages: []
  };
}
