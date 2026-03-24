#!/usr/bin/env python3
"""
Direct Riffusion generation script
Called by Node.js RiffusionClient via stdin/stdout
"""

import argparse
import sys
import torch
import io
import soundfile as sf
from diffusers import DiffusionPipeline

# Global pipeline (load once)
_pipe = None

def load_pipeline():
    global _pipe
    if _pipe is None:
        print("Loading Riffusion model...", file=sys.stderr)
        model_id = "riffusion/riffusion-model-v1"
        _pipe = DiffusionPipeline.from_pretrained(
            model_id,
            torch_dtype=torch.float32,
        )
        _pipe = _pipe.to('cpu')
        print("Model loaded", file=sys.stderr)
    return _pipe

def generate(prompt: str, duration: int, seed: int = None, negative_prompt: str = "low quality, noisy"):
    pipe = load_pipeline()
    generator = torch.Generator('cpu')
    if seed is not None:
        generator.manual_seed(seed)
    
    with torch.no_grad():
        result = pipe(
            prompt,
            negative_prompt=negative_prompt,
            num_inference_steps=20,
            audio_length_in_s=duration,
            generator=generator
        )
    
    audio = result.audios[0]  # numpy array
    sample_rate = result.sample_rate
    
    # Write to bytes
    buffer = io.BytesIO()
    sf.write(buffer, audio, sample_rate, format='WAV')
    return buffer.getvalue()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--prompt', required=True)
    parser.add_argument('--duration', type=int, default=10)
    parser.add_argument('--seed', type=int)
    parser.add_argument('--negative', default='low quality, noisy')
    parser.add_argument('--test', action='store_true', help='Test mode: just print ok')
    
    args = parser.parse_args()
    
    if args.test:
        print("OK")
        sys.exit(0)
    
    try:
        wav_data = generate(args.prompt, args.duration, args.seed, args.negative)
        sys.stdout.buffer.write(wav_data)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
