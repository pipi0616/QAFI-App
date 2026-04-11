#!/bin/bash
# Start both backend and frontend for development
# Usage: ./dev.sh

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Load .env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
    echo "[ok] Loaded .env"
else
    echo "[warn] No .env file found. Copy .env.example to .env"
fi

# Kill previous processes on our ports
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

echo "[starting] Backend on :8000"
conda run -n qafi_agent uvicorn backend.main:app --port 8000 --reload &
BACKEND_PID=$!

echo "[starting] Frontend on :5173"
cd frontend && npm run dev &
FRONTEND_PID=$!

echo ""
echo "================================"
echo "  QAFI App is running!"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8000"
echo "  API docs: http://localhost:8000/docs"
echo "================================"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait and clean up on Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo ''; echo 'Stopped.'; exit 0" SIGINT SIGTERM
wait
