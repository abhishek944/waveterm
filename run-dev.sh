#!/bin/bash
# Script to run Wave Terminal in development mode with visible logs

# Kill any existing wavesrv processes
pkill -f wavesrv

# Set environment variables
export WAVETERM_DEV=1
export WAVETERM_HOME="${HOME}/.waveterm-dev"

# Create the home directory if it doesn't exist
mkdir -p "$WAVETERM_HOME"

# Build the backend if needed
echo "Building backend..."
scripthaus run build-backend

# Run wavesrv in the background with visible logs
echo "Starting wavesrv..."
WAVETERM_DEV=1 WAVETERM_APP_PATH="$(pwd)" ./bin/wavesrv 2>&1 | tee "${WAVETERM_HOME}/wavesrv.log" &
WAVESRV_PID=$!

# Give wavesrv time to start
sleep 2

# Check if wavesrv is running
if ! ps -p $WAVESRV_PID > /dev/null; then
    echo "Failed to start wavesrv"
    exit 1
fi

echo "wavesrv started with PID: $WAVESRV_PID"

# Function to cleanup on exit
cleanup() {
    echo "Stopping wavesrv..."
    kill $WAVESRV_PID 2>/dev/null
    exit
}

# Set up trap to cleanup on script exit
trap cleanup EXIT INT TERM

# Run webpack watch in background
echo "Starting webpack watch..."
scripthaus run webpack-watch &
WEBPACK_PID=$!

# Give webpack time to build
sleep 5

# Run electron (this will block)
echo "Starting Electron app..."
scripthaus run electron

# This will only be reached if electron exits
kill $WEBPACK_PID 2>/dev/null