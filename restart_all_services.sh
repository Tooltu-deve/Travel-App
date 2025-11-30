#!/bin/bash

echo "🔄 Restarting All Travel AI Services"
echo "======================================"

# Stop all services
echo ""
echo "🛑 Step 1: Stopping all existing services..."
lsof -ti:3000 | xargs kill -9 2>/dev/null && echo "  ✅ Stopped Backend (port 3000)" || echo "  ⚠️  Backend not running"
lsof -ti:8001 | xargs kill -9 2>/dev/null && echo "  ✅ Stopped AI Agent (port 8001)" || echo "  ⚠️  AI Agent not running"
lsof -ti:8000 | xargs kill -9 2>/dev/null && echo "  ✅ Stopped AI Optimizer (port 8000)" || echo "  ⚠️  AI Optimizer not running"
pkill -f "nest start" 2>/dev/null
pkill -f "python3 main.py" 2>/dev/null
sleep 3

# Start AI Optimizer Service (port 8000)
echo ""
echo "🚀 Step 2: Starting AI Optimizer Service (port 8000)..."
cd /Users/macos/Documents/project-comthink/ai_optimizer_service
nohup python3 main.py > optimizer.log 2>&1 &
OPTIMIZER_PID=$!
echo "  Process ID: $OPTIMIZER_PID"
sleep 3

# Start Python AI Agent (port 8001)
echo ""
echo "🚀 Step 3: Starting Python AI Agent (port 8001)..."
cd /Users/macos/Documents/project-comthink/travel-ai-agent
nohup python3 main.py > agent.log 2>&1 &
AGENT_PID=$!
echo "  Process ID: $AGENT_PID"
sleep 5

# Start NestJS Backend (port 3000)
echo ""
echo "🚀 Step 4: Starting NestJS Backend (port 3000)..."
cd /Users/macos/Documents/project-comthink/backend
nohup npm run start:dev > backend.log 2>&1 &
BACKEND_PID=$!
echo "  Process ID: $BACKEND_PID"
echo "  ⏳ Waiting 15 seconds for backend to initialize..."
sleep 15

# Health checks
echo ""
echo "🏥 Step 5: Health Checks"
echo "======================================"

echo ""
echo "1️⃣  AI Optimizer (port 8000):"
curl -s -X POST http://localhost:8000/optimize-route \
  -H "Content-Type: application/json" \
  -d '{"poi_list": [], "user_mood": "relaxed", "duration_days": 1, "current_location": {"lat": 21.0, "lng": 105.0}}' \
  | python3 -c "import sys, json; d=json.load(sys.stdin); print('  ✅ OK' if 'optimized_route' in d else '  ❌ ERROR')" 2>/dev/null || echo "  ❌ ERROR: Cannot connect"

echo ""
echo "2️⃣  Python AI Agent (port 8001):"
curl -s http://localhost:8001/health \
  | python3 -c "import sys, json; d=json.load(sys.stdin); print('  ✅', d.get('status', 'Unknown'))" 2>/dev/null || echo "  ❌ ERROR: Cannot connect"

echo ""
echo "3️⃣  NestJS Backend (port 3000):"
curl -s http://localhost:3000/api/v1/ai/health \
  | python3 -c "import sys, json; d=json.load(sys.stdin); print('  ✅', d.get('status', 'Unknown'))" 2>/dev/null || echo "  ❌ ERROR: Cannot connect"

echo ""
echo "======================================"
echo "✨ All services started!"
echo ""
echo "📊 Service URLs:"
echo "  - Backend:      http://localhost:3000"
echo "  - AI Agent:     http://localhost:8001"
echo "  - AI Optimizer: http://localhost:8000"
echo ""
echo "📝 Logs:"
echo "  - Backend:      backend/backend.log"
echo "  - AI Agent:     travel-ai-agent/agent.log"
echo "  - AI Optimizer: ai_optimizer_service/optimizer.log"
echo ""
echo "🧪 Test with:"
echo "  curl -X POST http://localhost:3000/api/v1/ai/chat/quick \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"message\": \"Tôi muốn đi SaPa 2 ngày\", \"userId\": \"test\"}'"
echo ""
