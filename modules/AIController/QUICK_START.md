# AIController Quick Start Guide

Get up and running with AIController in 5 minutes!

## Prerequisites Check

Ensure you have:
- ✅ Node.js 18+ installed (`node --version`)
- ✅ MySQL running (`mysql --version`)
- ✅ Other Ex Nihilo modules running (IntentInterpreter, CharacterController, SceneController, ItemController, StoryTeller)

## 1. Setup Backend (2 minutes)

```bash
cd AIController

# Install dependencies
npm install

# Configure environment
cp .env.example .env
nano .env  # Edit with your MySQL credentials

# Setup database
npm run db:setup

# Start backend
npm run dev
```

Backend should now be running on `http://localhost:3035`

Test it: `curl http://localhost:3035/health`

## 2. Setup Frontend (2 minutes)

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend should now be running on `http://localhost:5173`

Open in browser: `http://localhost:5173`

## 3. Create Your First Chain (1 minute)

1. Click **Builder** in the navigation
2. Enter chain details:
   - Name: "My First Chain"
   - User ID: "admin"
3. Click **Add Step**
4. Configure step:
   - Module: Intent Interpreter
   - Method: POST
   - Endpoint: `/interpret`
   - Body: `{"message": "{{input.message}}"}`
5. Click **Test Chain**
6. Enter input: `{"message": "I attack the goblin"}`
7. Click **Execute Chain**
8. View results!

## Common Commands

### Backend
```bash
npm run dev         # Start development server
npm run build       # Build for production
npm start           # Run production build
npm run typecheck   # Type checking
npm run db:setup    # Reset database
```

### Frontend
```bash
npm run dev         # Start development server
npm run build       # Build for production
npm run preview     # Preview production build
npm run lint        # Lint code
```

## Testing Module Health

Check if all modules are running:

```bash
# AIController
curl http://localhost:3035/health

# IntentInterpreter
curl http://localhost:3032/health

# CharacterController
curl http://localhost:3031/health

# SceneController
curl http://localhost:3033/health

# ItemController
curl http://localhost:3034/health

# StoryTeller
curl http://localhost:3037/health
```

All should return `200 OK` with health status.

## Example API Request

Execute a chain via API:

```bash
curl -X POST http://localhost:3035/execute/1?userId=admin \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "message": "I attack the goblin",
      "userId": "admin",
      "characterName": "Thorin"
    }
  }'
```

## Troubleshooting

### Port already in use
```bash
# Find process on port 3035
lsof -i :3035

# Kill process
kill -9 <PID>
```

### Database connection failed
- Check MySQL is running: `sudo service mysql status`
- Verify credentials in `.env`
- Ensure database exists: `mysql -u root -p -e "SHOW DATABASES;"`

### Module not responding
- Start the module: `cd ../IntentInterpreter && npm run dev`
- Check module health endpoints (see above)
- Verify URLs in `.env`

## Next Steps

1. **Explore Sample Chains**: Go to "Chains" page to see pre-configured chains
2. **Read the Docs**: Check `README.md` for detailed documentation
3. **View Architecture**: See `DESIGN.md` for system design
4. **Create Complex Chains**: Use multiple steps with variable substitution

## Need Help?

- Check `README.md` for full documentation
- Review `DESIGN.md` for architecture details
- Look at sample chains in the database
- Check module READMEs: `../IntentInterpreter/README.md`, etc.

Happy chaining! 🔗
