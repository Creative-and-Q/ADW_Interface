# Setup Guide

## Prerequisites

- Docker Desktop installed and running
- Node.js >= 18.0.0
- Git

## Quick Setup

### 1. Configure Environment

Create your `.env` file:

```bash
cd AIDeveloper
cp .env.example .env
```

**Important:** Edit `.env` and set your actual values:

```bash
# Required: Get your API key from https://openrouter.ai/
OPENROUTER_API_KEY=sk-or-v1-your-actual-api-key

# Required: Set your workspace path (the directory containing AIDeveloper/ and modules/)
WORKSPACE_ROOT=/path/to/your/project/root
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start the Application

```bash
npm start
```

This will automatically:
- Check if Docker services are running
- Start MySQL and Redis if needed
- Build the application
- Start the server

## Manual Docker Management

If you prefer to manage Docker services manually:

```bash
# Start services
npm run docker:start

# Check status
npm run docker:status

# View logs
npm run docker:logs

# Stop services
npm run docker:stop
```

## Verification

### Check Services

```bash
# Check if MySQL is running
docker ps | grep aideveloper_mysql_dev

# Check if Redis is running
docker ps | grep aideveloper_redis_dev

# Test MySQL connection
mysql -h localhost -u root -prootpassword -e "SHOW DATABASES;"

# Test Redis connection
redis-cli ping
```

### Access Services

**MySQL:**
```bash
# Via Docker
docker exec -it aideveloper_mysql_dev mysql -uroot -prootpassword aideveloper

# Via local client
mysql -h localhost -u root -prootpassword aideveloper
```

**Redis:**
```bash
# Via Docker
docker exec -it aideveloper_redis_dev redis-cli

# Via local client
redis-cli
```

## Troubleshooting

### Error: "MySQL is not running"

```bash
# Start Docker services manually
npm run docker:start

# Check logs
npm run docker:logs mysql
```

### Error: "Port already in use"

```bash
# Find what's using the port
lsof -i :3306  # MySQL
lsof -i :6379  # Redis

# Stop conflicting services
brew services stop mysql    # If using Homebrew MySQL
brew services stop redis    # If using Homebrew Redis
```

### Error: "Database connection failed"

1. Check `.env` file has correct credentials:
   ```bash
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=rootpassword
   ```

2. Verify MySQL is running:
   ```bash
   npm run docker:status
   ```

3. Check MySQL logs:
   ```bash
   npm run docker:logs mysql
   ```

### Error: "OPENROUTER_API_KEY required"

Get your API key from https://openrouter.ai/ and add it to `.env`:
```bash
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

### Reset Everything

If you need to start fresh:

```bash
# Stop and remove all services and data
npm run docker:clean

# Start fresh
npm start
```

## Development Workflow

### Standard Development

```bash
# Starts everything (services + app)
npm start
```

### Hot Reload Development

```bash
# Start services once
npm run docker:start

# Run with hot reload
npm run dev
```

### Running Tests

```bash
npm test
npm run test:watch
npm run test:coverage
```

## Next Steps

1. ✅ Set up `.env` file with your API keys
2. ✅ Run `npm install`
3. ✅ Run `npm start`
4. 📖 Read `README.docker.md` for detailed Docker information
5. 📖 Check main `README.md` for application documentation

## Support

For more detailed Docker information, see [README.docker.md](./README.docker.md)

