# AIDeveloper Scripts

Utility scripts for development and automation.

## Branch Watcher

Automatically rebuilds AIDeveloper backend and frontend when you switch git branches.

### Usage

**Recommended (Node.js version):**
```bash
npm run watch:branch
```

**Alternative (Bash version):**
```bash
bash scripts/watch-branch.sh
```

### Features

- 🔍 **Automatic Detection**: Watches `.git/HEAD` for branch changes
- ⚡ **Fast Parallel Builds**: Builds backend and frontend simultaneously
- 🎯 **Debouncing**: Prevents rapid rebuild triggers
- 📊 **Build Summary**: Shows success/failure status and duration
- 🎨 **Colored Output**: Easy-to-read status messages

### How It Works

1. Monitors the `.git/HEAD` file for changes
2. When you run `git checkout <branch>`, the HEAD file changes
3. Detects the new branch name
4. Triggers parallel builds:
   - `npm run build` (AIDeveloper backend)
   - `cd frontend && npm run build` (Frontend client)
5. Shows build results with colored status indicators

### Example Output

```
═══════════════════════════════════════════════════════════
   Branch changed to: feature/new-workflow
   Rebuilding AIDeveloper + Frontend...
═══════════════════════════════════════════════════════════

ℹ Building AIDeveloper backend...
ℹ Building frontend...
✅ Backend build completed
✅ Frontend build completed

═══════════════════════════════════════════════════════════
   Build Summary (12.34s)
═══════════════════════════════════════════════════════════

✅ All builds completed successfully!

ℹ Watching for changes...
```

### When To Use

**Perfect for:**
- Working across multiple branches frequently
- Testing different features in isolation
- Ensuring builds are always fresh when switching contexts
- Development workflows with frequent branch switching

**Alternative approaches:**
- Use `npm run dev` for file-based auto-rebuild during active development
- Use `npm run build:all` for one-time manual builds
- Use `npm run build` or `npm run build:frontend` for individual builds

### Stopping the Watcher

Press `Ctrl+C` to stop the watcher gracefully.

## Other Scripts

### ensure-services.sh
Ensures MySQL and Redis are running before starting the server.

```bash
bash scripts/ensure-services.sh
```

Used automatically by `npm start` and `npm run dev`.
