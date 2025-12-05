#!/bin/bash

# Bytebot Development Startup Script
# This script sets up the environment and starts the agent and UI services

cd "$(dirname "$0")"

echo "🚀 Starting Bytebot Development Environment"
echo ""

# Function to stop existing processes
stop_existing_instances() {
    echo "🛑 Stopping existing Bytebot instances..."
    
    local found_processes=false
    
    # Stop agent processes - check for various patterns
    if pgrep -f "nest start" > /dev/null 2>&1 && pgrep -f "bytebot-agent" > /dev/null 2>&1; then
        echo "   Stopping bytebot-agent (nest start)..."
        pkill -f "nest start" 2>/dev/null
        found_processes=true
    fi
    
    if pgrep -f "bytebot-agent.*dist/main" > /dev/null 2>&1; then
        echo "   Stopping bytebot-agent (compiled)..."
        pkill -f "bytebot-agent.*dist/main" 2>/dev/null
        found_processes=true
    fi
    
    # Stop UI processes
    if pgrep -f "tsx server.ts" > /dev/null 2>&1; then
        echo "   Stopping bytebot-ui (tsx)..."
        pkill -f "tsx server.ts" 2>/dev/null
        found_processes=true
    fi
    
    if pgrep -f "bytebot-ui.*server" > /dev/null 2>&1; then
        echo "   Stopping bytebot-ui (node server)..."
        pkill -f "bytebot-ui.*server" 2>/dev/null
        found_processes=true
    fi
    
    # Wait a moment for graceful shutdown
    if [ "$found_processes" = true ]; then
        sleep 2
    fi
    
    # Check if ports are still in use and force kill if needed
    if lsof -ti :9991 > /dev/null 2>&1; then
        echo "   Force killing process on port 9991..."
        lsof -ti :9991 | xargs kill -9 2>/dev/null
        sleep 1
    fi
    
    if lsof -ti :9992 > /dev/null 2>&1; then
        echo "   Force killing process on port 9992..."
        lsof -ti :9992 | xargs kill -9 2>/dev/null
        sleep 1
    fi
    
    if [ "$found_processes" = true ] || lsof -ti :9991 > /dev/null 2>&1 || lsof -ti :9992 > /dev/null 2>&1; then
        echo "✅ Existing instances stopped"
    else
        echo "✅ No existing instances found"
    fi
    echo ""
}

# Stop existing instances before starting
stop_existing_instances

# Load environment variables from .env file if it exists
if [ -f .env ]; then
    echo "📄 Loading environment variables from .env file..."
    export $(grep -v '^#' .env | xargs)
else
    echo "⚠️  No .env file found. Using defaults or system environment variables."
    echo "   Create .env from .env.example: cp .env.example .env"
fi

# Set defaults if not in .env
export DATABASE_URL=${DATABASE_URL:-"postgresql://postgres:postgres@localhost:5433/bytebotdb"}
export BYTEBOT_DESKTOP_BASE_URL=${BYTEBOT_DESKTOP_BASE_URL:-"http://localhost:9990"}
export BYTEBOT_AGENT_BASE_URL=${BYTEBOT_AGENT_BASE_URL:-"http://localhost:9991"}
export BYTEBOT_DESKTOP_VNC_URL=${BYTEBOT_DESKTOP_VNC_URL:-"http://localhost:9990/websockify"}

echo "📦 Environment variables:"
echo "   DATABASE_URL=$DATABASE_URL"
echo "   BYTEBOT_DESKTOP_BASE_URL=$BYTEBOT_DESKTOP_BASE_URL"
if [ -n "$GEMINI_API_KEY" ]; then
    echo "   GEMINI_API_KEY=***set***"
fi
if [ -n "$ANTHROPIC_API_KEY" ]; then
    echo "   ANTHROPIC_API_KEY=***set***"
fi
if [ -n "$OPENAI_API_KEY" ]; then
    echo "   OPENAI_API_KEY=***set***"
fi
if [ -n "$BYTEBOT_LLM_PROXY_URL" ]; then
    echo "   BYTEBOT_LLM_PROXY_URL=$BYTEBOT_LLM_PROXY_URL"
fi
echo ""

# Check if at least one AI provider is configured
if [ -z "$GEMINI_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ] && [ -z "$BYTEBOT_LLM_PROXY_URL" ]; then
    echo "⚠️  WARNING: No AI provider API keys found!"
    echo "   Please set at least one of:"
    echo "   - GEMINI_API_KEY"
    echo "   - ANTHROPIC_API_KEY"
    echo "   - OPENAI_API_KEY"
    echo "   - BYTEBOT_LLM_PROXY_URL (for Ollama)"
    echo ""
    echo "   Or edit this script and uncomment the API key lines."
    echo ""
fi

# Check if Docker containers are running
if docker ps | grep -q "bytebot-desktop"; then
    echo "✅ Docker containers are already running"
    echo "   (Skipping container restart. Use 'docker compose -f docker/docker-compose.development.yml restart' to restart)"
else
    echo "🐳 Starting Docker containers..."
    docker compose -f docker/docker-compose.development.yml up -d
    echo "   Waiting for containers to be ready..."
    sleep 5
fi

# Start LiteLLM proxy for Ollama (if not running)
if ! lsof -ti :4000 > /dev/null 2>&1; then
    echo "🤖 Starting LiteLLM proxy for Ollama..."
    if command -v litellm &> /dev/null; then
        litellm --config litellm-config.yaml --port 4000 > /tmp/litellm.log 2>&1 &
        LITELLM_PID=$!
        echo "   LiteLLM proxy started (PID: $LITELLM_PID)"
        sleep 3
        
        # Verify it's running
        if curl -s http://localhost:4000/health > /dev/null 2>&1; then
            echo "   ✅ LiteLLM proxy is healthy"
        else
            echo "   ⚠️  LiteLLM proxy may not be ready yet"
        fi
    else
        echo "   ⚠️  LiteLLM not found. Install with: pipx install litellm"
        echo "   Will use Gemini fallback only"
    fi
else
    echo "✅ LiteLLM proxy is already running on port 4000"
fi

echo ""
echo "📊 Starting services..."
echo ""
echo "1️⃣  Starting bytebot-agent on port 9991..."
echo "2️⃣  Starting bytebot-ui on port 9992..."
echo ""
echo "💡 Access the UI at: http://localhost:9992"
echo "💡 Desktop VNC at: http://localhost:9990/novnc"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Start agent in background
cd packages/bytebot-agent
npm run start:dev &
AGENT_PID=$!

# Start UI in background
cd ../bytebot-ui
npm run dev &
UI_PID=$!

# Wait for user interrupt
trap "echo ''; echo '🛑 Stopping services...'; kill $AGENT_PID $UI_PID 2>/dev/null; exit" INT TERM

# Wait for processes
wait

