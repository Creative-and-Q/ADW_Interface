# Docker Setup Guide

This project uses Docker Compose for managing development services (MySQL and Redis).

## Quick Start

### 1. Start Development Services

```bash
# Start MySQL and Redis
npm run docker:start

# Or manually
bash scripts/docker-dev.sh start
```

### 2. Run the Application

```bash
npm start
```

The `npm start` command will automatically check and start Docker services if they're not running.

## Docker Commands

Use the helper script for managing Docker services:

```bash
# Start services
bash scripts/docker-dev.sh start

# Stop services (keeps data)
bash scripts/docker-dev.sh stop

# Restart services
bash scripts/docker-dev.sh restart

# View logs
bash scripts/docker-dev.sh logs
bash scripts/docker-dev.sh logs mysql
bash scripts/docker-dev.sh logs redis

# Check status
bash scripts/docker-dev.sh status

# Stop and remove containers (keeps data volumes)
bash scripts/docker-dev.sh down

# Remove everything including data (⚠️ destructive!)
bash scripts/docker-dev.sh clean
```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and update the values:

```bash
cp .env.example .env
```

Key variables:
- `OPENROUTER_API_KEY`: Your OpenRouter API key (required)
- `WORKSPACE_ROOT`: Path to your workspace (required)
- `DB_PASSWORD`: MySQL password (default: rootpassword)
- `MYSQL_ROOT_PASSWORD`: MySQL root password (default: rootpassword)

### Service Ports

- **MySQL**: `localhost:3306`
- **Redis**: `localhost:6379`
- **API Server**: `localhost:3000`

## Accessing Services

### MySQL

```bash
# Using Docker
docker exec -it aideveloper_mysql_dev mysql -uroot -prootpassword aideveloper

# Using local mysql client
mysql -h localhost -u root -prootpassword aideveloper
```

### Redis

```bash
# Using Docker
docker exec -it aideveloper_redis_dev redis-cli

# Using local redis-cli
redis-cli -h localhost
```

## Development Workflow

### Normal Development

```bash
# Start services (happens automatically with npm start)
npm start
```

### With Hot Reload

```bash
# Start Docker services
npm run docker:start

# Run in development mode
npm run dev
```

### Troubleshooting

#### Services Won't Start

```bash
# Check service status
bash scripts/docker-dev.sh status

# View logs
bash scripts/docker-dev.sh logs
```

#### Port Conflicts

If ports 3306 or 6379 are in use:

```bash
# Find processes using the ports
lsof -i :3306
lsof -i :6379

# Stop the conflicting services or modify docker-compose.dev.yml
```

#### Database Issues

```bash
# Reset database (⚠️ deletes all data!)
bash scripts/docker-dev.sh clean
bash scripts/docker-dev.sh start

# View MySQL logs
bash scripts/docker-dev.sh logs mysql
```

#### Connection Issues

Check your `.env` file matches the Docker configuration:
- `DB_HOST=localhost`
- `DB_PORT=3306`
- `DB_USER=root`
- `DB_PASSWORD=rootpassword`

## Production Deployment

For full production deployment with all services containerized, use:

```bash
docker compose up -d
```

This uses the main `docker-compose.yml` file which includes the application and frontend containers.

## File Structure

```
AIDeveloper/
├── docker-compose.yml          # Production: All services
├── docker-compose.dev.yml      # Development: MySQL + Redis only
├── .env                        # Your configuration (gitignored)
├── .env.example               # Example configuration
└── scripts/
    ├── docker-dev.sh          # Docker management helper
    └── ensure-services.sh     # Auto-start services script
```

## NPM Scripts

Add to your workflow:

```json
{
  "docker:start": "bash scripts/docker-dev.sh start",
  "docker:stop": "bash scripts/docker-dev.sh stop",
  "docker:logs": "bash scripts/docker-dev.sh logs",
  "docker:status": "bash scripts/docker-dev.sh status"
}
```

## Notes

- Development services (`docker-compose.dev.yml`) expose ports on localhost for easy access
- Data persists in Docker volumes between container restarts
- Use `docker:clean` only when you want to reset all data
- The `ensure-services.sh` script automatically starts services if Docker is available

