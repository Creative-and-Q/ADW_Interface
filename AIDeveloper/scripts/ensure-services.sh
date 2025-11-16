#!/bin/bash
# Ensure MySQL and Redis services are running

echo "Checking required services..."

# Check and start MySQL
if ! sudo service mysql status > /dev/null 2>&1; then
    echo "Starting MySQL..."
    sudo service mysql start
    if [ $? -eq 0 ]; then
        echo "✓ MySQL started successfully"
    else
        echo "✗ Failed to start MySQL"
        exit 1
    fi
else
    echo "✓ MySQL is already running"
fi

# Check and start Redis
if ! redis-cli ping > /dev/null 2>&1; then
    echo "Starting Redis..."
    sudo service redis-server start
    if [ $? -eq 0 ]; then
        # Wait a moment for Redis to fully start
        sleep 1
        if redis-cli ping > /dev/null 2>&1; then
            echo "✓ Redis started successfully"
        else
            echo "✗ Redis started but not responding"
            exit 1
        fi
    else
        echo "✗ Failed to start Redis"
        exit 1
    fi
else
    echo "✓ Redis is already running"
fi

# Check and kill any process using port 3000 (only if not called from a module)
# Skip this check if SKIP_PORT_CHECK is set (used when modules call this script)
if [ -z "$SKIP_PORT_CHECK" ]; then
    PORT_PID=$(lsof -ti:3000 2>/dev/null)
    if [ ! -z "$PORT_PID" ]; then
        echo "Found process using port 3000 (PID: $PORT_PID)"
        echo "Killing conflicting process..."
        kill -9 $PORT_PID 2>/dev/null
        sleep 1
        # Verify the port is free
        if lsof -i:3000 > /dev/null 2>&1; then
            echo "✗ Failed to free port 3000"
            exit 1
        else
            echo "✓ Port 3000 is now available"
        fi
    else
        echo "✓ Port 3000 is available"
    fi
fi

# Ensure SSH is configured for git operations
echo "Checking SSH configuration..."
SSH_ENV="$HOME/.ssh/agent-environment"

# Check if SSH environment file exists and is recent (less than 24 hours old)
if [ -f "$SSH_ENV" ]; then
    # Source SSH environment
    source "$SSH_ENV" > /dev/null 2>&1

    # Check if agent is still running
    if ps -p $SSH_AGENT_PID > /dev/null 2>&1; then
        echo "✓ SSH agent is running (PID: $SSH_AGENT_PID)"
    else
        echo "SSH agent not running, setting up..."
        bash "$(dirname "$0")/setup-ssh.sh" > /dev/null 2>&1
        source "$SSH_ENV" > /dev/null 2>&1
        echo "✓ SSH configured"
    fi
else
    echo "SSH not configured, running setup..."
    bash "$(dirname "$0")/setup-ssh.sh"
    source "$SSH_ENV" > /dev/null 2>&1
    echo "✓ SSH configured"
fi

echo "All services are ready!"
