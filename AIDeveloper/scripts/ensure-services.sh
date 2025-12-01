#!/bin/bash
# Ensure MySQL and Redis services are running

echo "Checking required services..."

# Check if docker-compose services are running
COMPOSE_FILE="$(dirname "$0")/../docker-compose.dev.yml"

if ! command -v docker &> /dev/null; then
    echo "⚠ Docker not found - skipping Docker service management"
    DOCKER_AVAILABLE=false
else
    DOCKER_AVAILABLE=true
fi

# Check MySQL
MYSQL_PORT=${DB_PORT:-3308}
MYSQL_CONTAINER="aideveloper_mysql_dev"

# Check if container exists and is running
if [ "$DOCKER_AVAILABLE" = true ] && docker ps --format '{{.Names}}' | grep -q "^${MYSQL_CONTAINER}$"; then
    # Container is running, check if it's healthy
    HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$MYSQL_CONTAINER" 2>/dev/null || echo "none")
    if [ "$HEALTH_STATUS" = "healthy" ]; then
        echo "✓ MySQL is already running on port $MYSQL_PORT"
    else
        echo "⏳ MySQL container is starting, waiting for it to be healthy..."
        for i in {1..30}; do
            HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$MYSQL_CONTAINER" 2>/dev/null || echo "none")
            if [ "$HEALTH_STATUS" = "healthy" ]; then
                echo "✓ MySQL is now ready"
                break
            fi
            if [ $i -eq 30 ]; then
                echo "✗ MySQL failed to become healthy - please check: docker compose -f docker-compose.dev.yml logs mysql"
                exit 1
            fi
            sleep 2
        done
    fi
else
    echo "⚠ MySQL container is not running"
    if [ "$DOCKER_AVAILABLE" = true ]; then
        echo "Starting MySQL via Docker Compose..."
        docker compose -f "$COMPOSE_FILE" up -d mysql
        echo "Waiting for MySQL to initialize and be ready (this may take 30-60 seconds)..."
        for i in {1..60}; do
            if docker ps --format '{{.Names}}' | grep -q "^${MYSQL_CONTAINER}$"; then
                HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$MYSQL_CONTAINER" 2>/dev/null || echo "none")
                if [ "$HEALTH_STATUS" = "healthy" ]; then
                    echo "✓ MySQL is now ready"
                    break
                fi
            fi
            if [ $i -eq 60 ]; then
                echo "✗ MySQL failed to start - please check: docker compose -f docker-compose.dev.yml logs mysql"
                docker compose -f "$COMPOSE_FILE" logs mysql | tail -20
                exit 1
            fi
            printf "."
            sleep 2
        done
        echo ""
    else
        echo "✗ Please start MySQL manually or install Docker"
        exit 1
    fi
fi

# Check and start Redis
if redis-cli ping > /dev/null 2>&1; then
    echo "✓ Redis is already running"
else
    echo "⚠ Redis is not running"
    if [ "$DOCKER_AVAILABLE" = true ]; then
        echo "Starting Redis via Docker Compose..."
        docker compose -f "$COMPOSE_FILE" up -d redis
        echo "Waiting for Redis to be ready..."
        for i in {1..15}; do
            if redis-cli ping > /dev/null 2>&1; then
                echo "✓ Redis is now running"
                break
            fi
            if [ $i -eq 15 ]; then
                echo "✗ Redis failed to start - please check: docker compose -f docker-compose.dev.yml logs redis"
                exit 1
            fi
            sleep 1
        done
    else
        echo "✗ Please start Redis manually or install Docker"
        exit 1
    fi
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

# Run database health check and migrations
echo "Checking database schema..."
bash "$(dirname "$0")/check-and-migrate-db.sh"
if [ $? -ne 0 ]; then
    echo "✗ Database setup failed"
    exit 1
fi

echo "All services are ready!"
