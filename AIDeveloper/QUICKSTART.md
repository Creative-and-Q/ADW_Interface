# Quick Start Guide

Get up and running with AIDeveloper in 5 minutes!

## Prerequisites

✅ Docker Desktop installed and running  
✅ Node.js >= 18.0.0

## Setup Steps

### 1. Configure Environment (1 minute)

```bash
cd AIDeveloper

# Copy environment template
cp .env.example .env

# Edit .env and add your OpenRouter API key
# Get one at: https://openrouter.ai/
nano .env  # or use your preferred editor
```

**Required changes in `.env`:**
```bash
OPENROUTER_API_KEY=sk-or-v1-YOUR-ACTUAL-API-KEY-HERE
```

### 2. Install Dependencies (1-2 minutes)

```bash
npm install
```

### 3. Start Everything! (2 minutes)

```bash
npm start
```

This will automatically:
- ✅ Start Docker services (MySQL on port 3308, Redis on port 6379)
- ✅ Build the application and frontend
- ✅ Start the server on port 3000

## Verify Setup

Once started, you should see:
```
✓ MySQL is already running on port 3308
✓ Redis is already running
✓ Port 3000 is available
✓ SSH configured
All services are ready!
```

Open your browser to: **http://localhost:3000**

## Initialize Database (Optional)

If you need to run migrations:

```bash
bash scripts/init-db.sh
```

## Common Commands

```bash
# Start application (with auto-service management)
npm start

# Development mode with hot reload
npm run dev

# Manage Docker services manually
npm run docker:start    # Start MySQL & Redis
npm run docker:stop     # Stop services
npm run docker:status   # Check status
npm run docker:logs     # View logs
npm run docker:clean    # Reset everything (⚠️ deletes data)

# Build
npm run build           # Build backend
npm run build:frontend  # Build frontend
npm run build:all       # Build everything

# Testing
npm test
```

## Service Ports

- **API Server**: http://localhost:3000
- **MySQL**: localhost:3308
- **Redis**: localhost:6379

## Troubleshooting

### Error: "OPENROUTER_API_KEY required"

1. Get your API key from https://openrouter.ai/
2. Add it to `.env`:
   ```bash
   OPENROUTER_API_KEY=sk-or-v1-your-key-here
   ```

### Error: "Docker not found"

1. Install Docker Desktop: https://www.docker.com/products/docker-desktop
2. Start Docker Desktop
3. Run `npm start` again

### Error: "Port already in use"

Check which ports are in use:
```bash
lsof -i :3000   # API port
lsof -i :3308   # MySQL port
lsof -i :6379   # Redis port
```

### Services won't start

```bash
# Check Docker service status
npm run docker:status

# View logs
npm run docker:logs

# Reset everything
npm run docker:clean
npm start
```

### Database connection issues

1. Verify services are running:
   ```bash
   npm run docker:status
   ```

2. Check connection settings in `.env`:
   ```bash
   DB_HOST=localhost
   DB_PORT=3308
   DB_USER=root
   DB_PASSWORD=rootpassword
   ```

3. Initialize database:
   ```bash
   bash scripts/init-db.sh
   ```

## Next Steps

- 📖 Read [SETUP.md](./SETUP.md) for detailed setup information
- 📖 Read [README.docker.md](./README.docker.md) for Docker details
- 📖 Check main [README.md](./README.md) for application documentation

## Need Help?

- View service logs: `npm run docker:logs`
- Check service status: `npm run docker:status`
- Reset everything: `npm run docker:clean && npm start`

---

**You're all set! Happy coding! 🚀**

