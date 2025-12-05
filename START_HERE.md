# Bytebot - Quick Start Guide

## Prerequisites

This is a **Node.js/TypeScript** application (NOT Python). You need:

- ✅ **Node.js** v20+ (you have v25.2.0 - perfect!)
- ✅ **npm** (you have 11.6.2 - perfect!)
- ✅ **Docker** (you have Docker - perfect!)
- ✅ **Git** (for cloning, if needed)

**No Python environment needed** - this is a Node.js application.

## Quick Start (3 Steps)

### Step 1: Configure Environment Variables

1. **Copy the example file**:
   ```bash
   cd /Users/lxupkzwjs/Developer/eval/bytebot
   cp .env.example .env
   ```

2. **Edit `.env` file** and add at least ONE AI provider API key:
   ```bash
   # Open .env in your editor
   nano .env
   # or
   code .env
   ```

3. **Uncomment and set your API key** (choose one):
   ```bash
   # For Google Gemini (recommended):
   GEMINI_API_KEY=your-actual-gemini-key-here
   
   # OR for Anthropic:
   ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
   
   # OR for OpenAI:
   OPENAI_API_KEY=sk-your-actual-key-here
   ```

### Step 2: Start Docker Services

Start the desktop and database containers:

```bash
cd /Users/lxupkzwjs/Developer/eval/bytebot
docker compose -f docker/docker-compose.development.yml up -d
```

Wait a few seconds for services to start, then verify:
```bash
docker ps --filter "name=bytebot"
```

You should see:
- `bytebot-desktop` (port 9990)
- `bytebot-postgres` (port 5433)

### Step 3: Start Application Services

**Option A: Use the Startup Script** (Easiest)

```bash
cd /Users/lxupkzwjs/Developer/eval/bytebot
./start-dev.sh
```

This will:
- Set environment variables from `.env`
- Check Docker containers
- Start agent and UI
- Show you the access URLs

**Option B: Manual Start** (Two Terminals)

**Terminal 1 - Agent:**
```bash
cd /Users/lxupkzwjs/Developer/eval/bytebot/packages/bytebot-agent
npm run start:dev
```

**Terminal 2 - UI:**
```bash
cd /Users/lxupkzwjs/Developer/eval/bytebot/packages/bytebot-ui
npm run dev
```

## Access the Application

Once started, access:

- **Web UI**: http://localhost:9992
- **Agent API**: http://localhost:9991
- **Desktop VNC**: http://localhost:9990/novnc

## First Task

1. Open http://localhost:9992 in your browser
2. Enter a task: "Take a screenshot of the desktop"
3. Click "Create Task"
4. Watch it execute!

## Troubleshooting

### Services Won't Start

**Check Docker:**
```bash
docker ps
docker logs bytebot-desktop
docker logs bytebot-postgres
```

**Check Ports:**
```bash
lsof -i :9990
lsof -i :9991
lsof -i :9992
lsof -i :5433
```

**Check Database:**
```bash
# Test connection
docker exec bytebot-postgres psql -U postgres -d bytebotdb -c "SELECT 1;"
```

### Agent Not Starting

**Check logs:**
```bash
# If using startup script, check the terminal output
# If manual, check the terminal where you ran npm run start:dev
```

**Common issues:**
- Missing `DATABASE_URL` - check `.env` file
- Database not ready - wait a few seconds after starting Docker
- Port conflicts - check if ports are in use

### No Models Available

**Check API keys:**
```bash
# Verify your .env file has at least one API key uncommented
cat .env | grep API_KEY
```

**Restart agent** after setting API keys:
```bash
# Stop agent (Ctrl+C) and restart
cd packages/bytebot-agent
npm run start:dev
```

### Task Creation Fails

**Check agent logs** for error messages:
- Missing API keys
- Database connection issues
- Desktop service not accessible

## Environment Variables Reference

See `.env.example` for all available configuration options.

### Required (Minimum)
- `DATABASE_URL` - PostgreSQL connection
- `BYTEBOT_DESKTOP_BASE_URL` - Desktop service URL
- At least ONE AI provider API key

### Optional
- `BYTEBOT_LLM_PROXY_URL` - For Ollama support
- `USE_FALLBACK_PROVIDERS` - Enable fallback system
- `OLLAMA_MODEL` - Ollama model name

## Stopping the Application

**Stop application services:**
```bash
# If using startup script: Ctrl+C
# If manual: Ctrl+C in each terminal
```

**Stop Docker services:**
```bash
docker compose -f docker/docker-compose.development.yml down
```

**Stop everything:**
```bash
docker compose -f docker/docker-compose.development.yml down
pkill -f "nest start"
pkill -f "next dev"
```

## Next Steps

1. ✅ Set your API key in `.env`
2. ✅ Start the application
3. ✅ Create your first task
4. ✅ Explore the features
5. ✅ Read the documentation in Obsidian

## Getting API Keys

### Google Gemini (Free tier available)
1. Go to https://aistudio.google.com/apikey
2. Create API key
3. Add to `.env`: `GEMINI_API_KEY=your-key`

### Anthropic Claude
1. Go to https://console.anthropic.com/
2. Create API key
3. Add to `.env`: `ANTHROPIC_API_KEY=sk-ant-...`

### OpenAI
1. Go to https://platform.openai.com/api-keys
2. Create API key
3. Add to `.env`: `OPENAI_API_KEY=sk-...`

### Ollama (Free, Local)
1. Install: `curl -fsSL https://ollama.ai/install.sh | sh`
2. Pull model: `ollama pull llama3.2`
3. Set up LiteLLM proxy (see docs)
4. Add to `.env`: `BYTEBOT_LLM_PROXY_URL=http://localhost:4000`

---

**Need Help?** Check the documentation in `Bytebot/` folder in Obsidian!

