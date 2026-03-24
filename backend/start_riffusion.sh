#!/bin/bash
# Start Riffusion API server for Mangoma

cd "$(dirname "$0")"

# Load environment variables from .env if present
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Also set HF_HUB_TOKEN for Hugging Face libraries
export HF_HUB_TOKEN="${HUGGINGFACE_API_TOKEN}"

echo "Starting Riffusion server..."
echo "Log: $(pwd)/riffusion_server.log"
echo "PID: $(pwd)/riffusion_server.pid"

# Start the server in background
python3 riffusion_server.py > riffusion_server.log 2>&1 &
echo $! > riffusion_server.pid

echo "Riffusion server started (PID $(cat riffusion_server.pid))"
echo "Health check: curl http://localhost:3000/health"
echo ""
echo "To stop: kill $(cat riffusion_server.pid) && rm riffusion_server.pid"
