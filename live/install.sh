#!/bin/bash
# Install Mangoma Live dependencies

set -e

echo "=== Mangoma Live Installation ==="
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed. Please install Node.js 20+ first."
  exit 1
fi

echo "✓ Node.js detected: $(node --version)"

# Check for npm
if ! command -v npm &> /dev/null; then
  echo "❌ npm is not installed."
  exit 1
fi

echo "✓ npm detected: $(npm --version)"

# Check for ffmpeg
if ! command -v ffmpeg &> /dev/null; then
  echo "⚠️  ffmpeg is not installed or not in PATH."
  echo "   Install it:"
  echo "     Ubuntu/Debian: sudo apt-get install ffmpeg"
  echo "     macOS: brew install ffmpeg"
  echo "     Windows: Download from ffmpeg.org"
  echo ""
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
else
  echo "✓ ffmpeg detected: $(ffmpeg -version | head -n1)"
fi

echo ""
echo "Installing npm dependencies..."
npm install

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Copy .env.example to .env"
echo "2. Edit .env and add your GEMINI_API_KEY"
echo "3. (Optional) Add YOUTUBE_STREAM_KEY when ready to test streaming"
echo "4. Run: npm run dev"
echo "5. Open: http://localhost:8080/frontend/"
echo ""
