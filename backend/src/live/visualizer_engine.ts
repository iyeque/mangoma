/**
 * Visualizer Engine – Generates FFmpeg filter strings for audio-reactive video
 * 
 * Simplified version focused on clean integration with StreamRunner.
 * Uses FFmpeg's showwaves filter for waveform display over a colored background.
 */

export interface VisualizerConfig {
  width: number;
  height: number;
  fps: number;
  mood: 'chill' | 'energetic' | 'focus' | 'nostalgic' | 'happy' | 'melancholic' | 'dark' | 'uplifting';
  intensity: number; // 0-1
  bpm: number;
}

const MOOD_COLORS: Record<string, { background: string; primary: string; secondary: string }> = {
  chill: { background: '#1a1a2e', primary: '#4CAF50', secondary: '#81C784' },
  energetic: { background: '#2b1010', primary: '#FF5722', secondary: '#FF8A65' },
  focus: { background: '#0d1b2a', primary: '#2196F3', secondary: '#64B5F6' },
  nostalgic: { background: '#1e1426', primary: '#9C27B0', secondary: '#BA68C8' },
  happy: { background: '#1a1a1a', primary: '#FFEB3B', secondary: '#FFF59D' },
  melancholic: { background: '#0c0c0c', primary: '#607D8B', secondary: '#90A4AE' },
  dark: { background: '#000000', primary: '#212121', secondary: '#424242' },
  uplifting: { background: '#1a0a1a', primary: '#E91E63', secondary: '#F48FB1' }
};

export class VisualizerEngine {
  private cfg: VisualizerConfig;

  constructor(cfg: VisualizerConfig) {
    this.cfg = cfg;
  }

  update(params: Partial<VisualizerConfig>) {
    this.cfg = { ...this.cfg, ...params };
  }

  /**
   * Build FFmpeg filter complex string.
   * Assumes audio input is stream 0 (pipe:0)
   * Outputs video labeled [v]
   */
  buildFilterComplex(): string {
    const { width, height, fps, mood, intensity, bpm } = this.cfg;
    const colors = MOOD_COLORS[mood] || MOOD_COLORS.chill;

    // Convert hex to BGR format 0xBBGGRR
    const primaryBgr = this.hexToBgr(colors.primary);

    // 1. Background color
    const filters: string[] = [
      `color=c=${colors.background}:s=${width}x${height}:r=${fps}[base]`
    ];

    // 2. Waveform from audio
    // Use showwaves with line mode, custom color
    const waveFilter = `[0:a]showwaves=s=${width}x${height}:mode=line:colors=${primaryBgr}:r=${fps}[wave]`;
    filters.push(waveFilter);

    // 3. Blend waveform over background with intensity-controlled opacity
    const opacity = (0.3 + intensity * 0.5).toFixed(2);
    filters.push(`[base][wave]blend=all_mode=addition:all_opacity=${opacity}[v]`);

    return filters.join(';');
  }

  private hexToBgr(hex: string): string {
    const r = hex.slice(1, 3);
    const g = hex.slice(3, 5);
    const b = hex.slice(5, 7);
    return `0x${b}${g}${r}`;
  }

  getConfig(): VisualizerConfig {
    return { ...this.cfg };
  }
}
