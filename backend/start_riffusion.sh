#!/bin/bash
# Start Riffusion API server for Mangoma

cd "$(dirname "$0")"

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
