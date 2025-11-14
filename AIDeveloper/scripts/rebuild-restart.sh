#!/bin/bash
# Rebuild and restart script for AIDeveloper
# This script runs detached to survive server shutdown

LOG_FILE="/tmp/aideveloper-restart.log"
WORK_DIR="/home/kevin/Home/ex_nihilo/AIDeveloper"

# Redirect all output to log file
exec >> "$LOG_FILE" 2>&1

echo "========================================"
echo "Restart initiated at $(date)"
echo "========================================"

# Change to AIDeveloper directory
cd "$WORK_DIR" || {
  echo "ERROR: Failed to cd to $WORK_DIR"
  exit 1
}

# Build backend
echo "Building backend..."
npm run build
if [ $? -ne 0 ]; then
  echo "ERROR: Backend build failed"
  exit 1
fi

# Build frontend
echo "Building frontend..."
npm run build:frontend
if [ $? -ne 0 ]; then
  echo "ERROR: Frontend build failed"
  exit 1
fi

# Kill existing server processes
echo "Stopping existing server processes..."
pkill -9 -f "node dist/server.js"
pkill -9 -f "tsx watch src/server.ts"
pkill -9 -f "node.*src/server.ts"

# Wait for processes to terminate
echo "Waiting for processes to terminate..."
sleep 5

# Start the server in a completely new session
echo "Starting server in new session..."
# Use setsid to create a new session and completely detach from terminal
setsid bash -c "cd $WORK_DIR && npm start > /tmp/aideveloper-server.log 2>&1 < /dev/null &" &

sleep 2

# Verify server started
if pgrep -f "node dist/server.js" > /dev/null; then
  SERVER_PID=$(pgrep -f "node dist/server.js")
  echo "Server started successfully with PID: $SERVER_PID"
else
  echo "WARNING: Server process not detected immediately"
fi

echo "Restart complete at $(date)"
echo "========================================"
