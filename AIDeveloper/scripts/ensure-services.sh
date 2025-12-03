#!/bin/bash
# Ensure MySQL and Redis services are running

# Timeout function for macOS compatibility (timeout command not available by default)
run_with_timeout() {
    local timeout=$1; shift
    "$@" & local pid=$!
    ( sleep $timeout; kill -0 $pid 2>/dev/null && kill $pid 2>/dev/null ) &
    local killer=$!
    wait $pid 2>/dev/null
    local status=$?
    kill -0 $killer 2>/dev/null && kill $killer 2>/dev/null
    return $status
}

echo "Checking required services..."

# Check if docker-compose services are running
COMPOSE_FILE="$(dirname "$0")/../docker-compose.dev.yml"

if ! command -v docker &> /dev/null; then
    echo "⚠ Docker not found - skipping Docker service management"
    DOCKER_AVAILABLE=false
else
    DOCKER_AVAILABLE=true
    echo "Checking Docker daemon health..."
    if ! run_with_timeout 5 docker info > /dev/null 2>&1; then
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "✗ ERROR: Docker daemon is not responding"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "Docker is installed but the daemon is not working properly."
        echo ""
        echo "Please restart Docker Desktop:"
        echo "  1. Quit Docker Desktop completely (Cmd+Q or right-click whale icon → Quit)"
        echo "  2. Wait 10 seconds"
        echo "  3. Open Docker Desktop again"
        echo "  4. Wait for Docker to start (whale icon in menu bar should be steady)"
        echo "  5. Run 'npm start' again"
        echo ""
        echo "If that doesn't work, try resetting Docker:"
        echo "  Docker Desktop → Troubleshoot → Reset to factory defaults"
        echo ""
        exit 1
    fi
    echo "✓ Docker daemon is healthy"
fi

# Check MySQL
MYSQL_PORT=${DB_PORT:-3308}
MYSQL_CONTAINER="aideveloper_mysql_dev"

# Check if container exists and is running
MYSQL_RUNNING=false
if [ "$DOCKER_AVAILABLE" = true ]; then
    DOCKER_PS_RESULT=$(run_with_timeout 5 docker ps --format '{{.Names}}' 2>&1)
    DOCKER_PS_EXIT=$?
    if [ $DOCKER_PS_EXIT -ne 0 ]; then
        echo "✗ Docker command failed - daemon may not be running"
        echo "Please ensure Docker Desktop is running and try again"
        exit 1
    fi
    if echo "$DOCKER_PS_RESULT" | grep -q "^${MYSQL_CONTAINER}$"; then
        MYSQL_RUNNING=true
        HEALTH_STATUS=$(run_with_timeout 3 docker inspect --format='{{.State.Health.Status}}' "$MYSQL_CONTAINER" 2>/dev/null || echo "none")
        if [ "$HEALTH_STATUS" = "healthy" ]; then
            echo "✓ MySQL is already running on port $MYSQL_PORT"
        else
            echo "⏳ MySQL container is starting, waiting for it to be healthy..."
            for i in {1..30}; do
                HEALTH_STATUS=$(run_with_timeout 3 docker inspect --format='{{.State.Health.Status}}' "$MYSQL_CONTAINER" 2>/dev/null || echo "none")
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
    fi
fi

if [ "$DOCKER_AVAILABLE" = true ] && [ "$MYSQL_RUNNING" = false ]; then
    echo "⚠ MySQL container is not running"
    echo "Starting MySQL via Docker Compose..."
    if ! run_with_timeout 30 docker compose -f "$COMPOSE_FILE" up -d mysql 2>&1; then
        echo "✗ Failed to start MySQL container"
        echo "Docker may not be responding. Please restart Docker Desktop and try again."
        exit 1
    fi
    echo "Waiting for MySQL to initialize and be ready (max 60 seconds)..."
    for i in {1..30}; do
        DOCKER_PS_CHECK=$(run_with_timeout 3 docker ps --format '{{.Names}}' 2>&1)
        if [ $? -ne 0 ]; then
            echo ""
            echo "✗ Docker command timed out - daemon may have stopped responding"
            exit 1
        fi
        if echo "$DOCKER_PS_CHECK" | grep -q "^${MYSQL_CONTAINER}$"; then
            HEALTH_STATUS=$(run_with_timeout 3 docker inspect --format='{{.State.Health.Status}}' "$MYSQL_CONTAINER" 2>/dev/null || echo "none")
            if [ "$HEALTH_STATUS" = "healthy" ]; then
                echo ""
                echo "✓ MySQL is now ready"
                break
            fi
        fi
        if [ $i -eq 30 ]; then
            echo ""
            echo "✗ MySQL failed to start within timeout period"
            echo "Check logs: docker compose -f docker-compose.dev.yml logs mysql"
            exit 1
        fi
        printf "."
        sleep 2
    done
elif [ "$DOCKER_AVAILABLE" = false ]; then
    echo "✗ Docker not available - please install Docker Desktop or start MySQL manually"
    exit 1
fi

# Check and start Redis
if run_with_timeout 3 redis-cli ping > /dev/null 2>&1; then
    echo "✓ Redis is already running"
else
    echo "⚠ Redis is not running"
    if [ "$DOCKER_AVAILABLE" = true ]; then
        echo "Starting Redis via Docker Compose..."
        if ! run_with_timeout 30 docker compose -f "$COMPOSE_FILE" up -d redis 2>&1; then
            echo "✗ Failed to start Redis container"
            echo "Docker may not be responding. Please restart Docker Desktop and try again."
            exit 1
        fi
        echo "Waiting for Redis to be ready (max 30 seconds)..."
        for i in {1..15}; do
            if run_with_timeout 2 redis-cli ping > /dev/null 2>&1; then
                echo "✓ Redis is now running"
                break
            fi
            if [ $i -eq 15 ]; then
                echo "✗ Redis failed to start within timeout period"
                echo "Check logs: docker compose -f docker-compose.dev.yml logs redis"
                exit 1
            fi
            sleep 2
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
