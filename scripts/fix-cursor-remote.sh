#!/bin/bash
# Script to clean up stale Cursor remote server processes and lock files

echo "Cleaning up stale Cursor remote server connections..."

# Kill all cursor-server processes (they will restart automatically)
echo "Stopping Cursor server processes..."
pkill -f "cursor-server" || true
pkill -f "multiplex-server" || true

# Wait a moment for processes to terminate
sleep 2

# Clean up old lock files (older than 1 hour)
echo "Cleaning up old lock files..."
find /tmp -name "cursor-remote-lock.*" -type f -mmin +60 -delete 2>/dev/null

# Clean up old token files (older than 1 hour)
echo "Cleaning up old token files..."
find /tmp -name "cursor-remote-*.token.*" -type f -mmin +60 -delete 2>/dev/null

# Clean up old log files (older than 24 hours)
echo "Cleaning up old log files..."
find /tmp -name "cursor-remote-*.log.*" -type f -mtime +1 -delete 2>/dev/null

echo "Cleanup complete. Cursor will reconnect automatically on next connection attempt."
echo ""
echo "If you're still having issues:"
echo "1. Disconnect from the remote server in Cursor"
echo "2. Close the SSH connection terminal"
echo "3. Reconnect to the remote server"

