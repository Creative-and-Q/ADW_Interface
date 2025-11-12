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

echo "All services are ready!"
