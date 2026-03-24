#!/usr/bin/env python3
"""
Riffusion API Server for Mangoma
Provides a simple HTTP endpoint for music generation
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import torch
import numpy as np
from diffusers import DiffusionPipeline
from io import BytesIO
import tempfile
import os
import soundfile as sf

app = Flask(__name__)
CORS(app)

# Global pipeline
pipe = None
device = "cuda" if torch.cuda.is_available() else "cpu"

def load_model():
    """Load the Riffusion pipeline (CPU-friendly)"""
    global pipe
    if pipe is None:
        print("Loading Riffusion pipeline...")
        # Use a smaller model suitable for CPU
        model_id = "riffusion/riffusion-model-v1"
        pipe = DiffusionPipeline.from_pretrained(
            model_id,
            torch_dtype=torch.float32,  # CPU-friendly
            # No token needed for public model
        )
        pipe = pipe.to(device)
        print(f"Model loaded on {device}")
    return pipe

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "model": "riffusion", "device": device})

@app.route('/generate', methods=['POST'])
def generate():
    """
    Generate music from text prompt
    
    Expected JSON:
    {
        "prompt": "A gentle lofi beat",
        "duration": 10,  // seconds (approx, default 10)
        "seed": optional int,
        "negative_prompt": optional string
    }
    """
    try:
        data = request.get_json()
        prompt = data.get('prompt', 'lofi beat')
        duration = min(data.get('duration', 10), 30)  # max 30 sec for CPU
        seed = data.get('seed')
        negative_prompt = data.get('negative_prompt', 'low quality, noisy')
        
        # Load model if not already
        generator = torch.Generator(device)
        if seed is not None:
            generator.manual_seed(seed)
        
        pipe = load_model()
        
        print(f"Generating: {prompt} ({duration}s)")
        
        # Generate spectrogram
        with torch.no_grad():
            result = pipe(
                prompt,
                negative_prompt=negative_prompt,
                num_inference_steps=20,  # faster for CPU
                audio_length_in_s=duration,
                generator=generator
            )
        
        # Get audio
        audio = result.audios[0]  # numpy array, shape (samples, channels)
        sample_rate = result.sample_rate
        
        # Convert to WAV in memory
        buffer = BytesIO()
        sf.write(buffer, audio, sample_rate, format='WAV')
        buffer.seek(0)
        
        # Return audio file
        return send_file(
            buffer,
            mimetype='audio/wav',
            as_attachment=False,
            download_name='generated.wav'
        )
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/info', methods=['GET'])
def info():
    return jsonify({
        "model": "riffusion/riffusion-model-1",
        "device": device,
        "max_duration": 30,
        "default_duration": 10
    })

if __name__ == '__main__':
    print("Starting Riffusion server...")
    # Pre-load model on startup
    load_model()
    app.run(host='0.0.0.0', port=3000, debug=False)
