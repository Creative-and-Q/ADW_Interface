#!/bin/bash
# Docker development services management

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.dev.yml"

case "$1" in
    start)
        echo "Starting development services (MySQL & Redis)..."
        docker compose -f "$COMPOSE_FILE" up -d
        echo "Waiting for services to be healthy..."
        sleep 3
        docker compose -f "$COMPOSE_FILE" ps
        ;;
    stop)
        echo "Stopping development services..."
        docker compose -f "$COMPOSE_FILE" stop
        ;;
    restart)
        echo "Restarting development services..."
        docker compose -f "$COMPOSE_FILE" restart
        ;;
    down)
        echo "Stopping and removing development services..."
        docker compose -f "$COMPOSE_FILE" down
        ;;
    logs)
        docker compose -f "$COMPOSE_FILE" logs -f "${@:2}"
        ;;
    status)
        docker compose -f "$COMPOSE_FILE" ps
        ;;
    clean)
        echo "Stopping and removing development services with volumes..."
        echo "⚠️  WARNING: This will delete all data in MySQL and Redis!"
        read -p "Are you sure? (yes/no): " confirm
        if [ "$confirm" = "yes" ]; then
            docker compose -f "$COMPOSE_FILE" down -v
            echo "✓ Services and volumes removed"
        else
            echo "Cancelled"
        fi
        ;;
    *)
        echo "Docker Development Services Management"
        echo ""
        echo "Usage: $0 {start|stop|restart|down|logs|status|clean}"
        echo ""
        echo "Commands:"
        echo "  start   - Start MySQL and Redis containers"
        echo "  stop    - Stop containers (keeps data)"
        echo "  restart - Restart containers"
        echo "  down    - Stop and remove containers (keeps volumes)"
        echo "  logs    - Show container logs (use 'logs mysql' or 'logs redis' for specific service)"
        echo "  status  - Show container status"
        echo "  clean   - Stop and remove containers AND volumes (deletes all data)"
        echo ""
        echo "Examples:"
        echo "  $0 start         # Start services"
        echo "  $0 logs mysql    # View MySQL logs"
        echo "  $0 status        # Check service status"
        exit 1
        ;;
esac

