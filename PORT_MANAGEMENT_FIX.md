# Port Management & Environment Variable Detection - Complete Fix

## 🔴 Issues Identified

### Issue #1: Vite Auto-Increments Ports on Conflict
**Current Behavior:**
```bash
vite --port 5175
Port 5175 is in use, trying another one...
# Starts on 5176 instead
```

**Problem:** Leads to port sprawl, conflicts not resolved

**Desired Behavior:**
- Detect port conflict
- Kill process using that port
- Start on intended port

---

### Issue #2: Ports Should Be Environment Variables
**Current:** Hardcoded in package.json
```json
"dev": "vite --port 5175"
```

**Desired:** Configurable via env vars
```json
"dev": "vite --port ${FRONTEND_PORT:-5175}"
```

---

### Issue #3: ModuleImportAgent Didn't Detect Port Variables
**WorkflowOrchestrator module.json MISSING:**
- DB_HOST
- DB_PORT
- DB_USER
- DB_PASSWORD
- DB_NAME
- AIDEVELOPER_API_URL

**Why:** Old ModuleImportAgent ran (before env scanner was added)

---

## 🛠️ Complete Solution

### Fix #1: Update Vite Start Script with Port Killing

**For all frontend/package.json files:**

**Before:**
```json
{
  "scripts": {
    "dev": "vite --port 5175"
  }
}
```

**After:**
```json
{
  "scripts": {
    "predev": "node -e \"const net=require('net');const port=process.env.FRONTEND_PORT||5175;const srv=net.createServer();srv.once('error',e=>{if(e.code==='EADDRINUSE'){console.log('Port '+port+' in use, killing process...');require('child_process').execSync('lsof -ti:'+port+' | xargs kill -9 2>/dev/null || true')}});srv.once('listening',()=>srv.close());srv.listen(port)\"",
    "dev": "vite --port ${FRONTEND_PORT:-5175}"
  }
}
```

**Or simpler bash approach:**
```json
{
  "scripts": {
    "dev": "sh -c 'PORT=${FRONTEND_PORT:-5175}; lsof -ti:$PORT | xargs kill -9 2>/dev/null || true; vite --port $PORT'"
  }
}
```

---

### Fix #2: Make Ports Environment-Variable Configurable

#### Backend Ports (Already Done!)
Most backends already use:
```typescript
const PORT = process.env.PORT || 3051;
```

#### Frontend Ports (Need to Update)
**Update all frontend/package.json:**
```json
{
  "scripts": {
    "dev": "vite --port ${FRONTEND_PORT:-5175}",
    "preview": "vite preview --port ${FRONTEND_PORT:-5175}"
  }
}
```

**Or use Vite config with env vars:**
```typescript
// vite.config.ts
export default defineConfig({
  server: {
    port: parseInt(process.env.FRONTEND_PORT || '5175'),
    strictPort: true, // Fail if port is busy instead of trying next
  }
});
```

---

### Fix #3: Update WorkflowOrchestrator module.json

**Add missing environment variables:**
```json
{
  "envVars": [
    {
      "key": "DB_HOST",
      "description": "MySQL database host",
      "required": false,
      "defaultValue": "localhost",
      "type": "string",
      "secret": false,
      "modulePrefix": "WORKFLOW"
    },
    {
      "key": "DB_PORT",
      "description": "MySQL database port",
      "required": false,
      "defaultValue": "3306",
      "type": "number",
      "secret": false,
      "modulePrefix": "WORKFLOW"
    },
    {
      "key": "DB_USER",
      "description": "MySQL database user",
      "required": false,
      "defaultValue": "root",
      "type": "string",
      "secret": false,
      "modulePrefix": "WORKFLOW"
    },
    {
      "key": "DB_PASSWORD",
      "description": "MySQL database password",
      "required": true,
      "type": "string",
      "secret": true,
      "modulePrefix": "WORKFLOW"
    },
    {
      "key": "DB_NAME",
      "description": "MySQL database name",
      "required": false,
      "defaultValue": "aideveloper",
      "type": "string",
      "secret": false,
      "modulePrefix": "WORKFLOW"
    },
    {
      "key": "AIDEVELOPER_API_URL",
      "description": "AIDeveloper API base URL for creating sub-workflows",
      "required": false,
      "defaultValue": "http://localhost:3000",
      "type": "string",
      "secret": false,
      "modulePrefix": "WORKFLOW"
    },
    // ... existing OPENROUTER vars
  ]
}
```

---

### Fix #4: Enhance ModuleImportAgent Detection

**Already Implemented:** ✅
- Now scans nested package.json files
- Detects frontend/package.json
- Includes nested environment variables

**Needs Deployment:** Backend restart required

---

## 🎯 Recommended Implementation Strategy

### Option A: Environment Variable Approach (BEST)

**Update Vite configs to use env vars with strict port mode:**

```typescript
// vite.config.ts for all frontends
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.FRONTEND_PORT || '5175'),
    strictPort: true, // Fail instead of auto-increment
    host: true, // Listen on all addresses
  },
  build: {
    outDir: 'dist',
  },
});
```

**Benefits:**
- Configurable per module
- Fails fast on conflicts (no silent port changes)
- Integrates with deployment manager

---

### Option B: Pre-Kill Script (QUICK FIX)

**Add to all frontend/package.json:**
```json
{
  "scripts": {
    "predev": "lsof -ti:${FRONTEND_PORT:-5175} | xargs kill -9 2>/dev/null || true",
    "dev": "vite --port ${FRONTEND_PORT:-5175}"
  }
}
```

**Benefits:**
- Quick to implement
- Cleans up port before starting
- Works immediately

---

### Option C: Deployment Manager Integration (PROPER FIX)

**Update DeploymentManager to handle port conflicts:**

```typescript
async startModule(moduleName: string) {
  const manifest = await getModuleManifest(moduleName);
  
  // Check ports before starting
  if (manifest.port) {
    await killProcessOnPort(manifest.port);
  }
  if (manifest.frontend?.port) {
    await killProcessOnPort(manifest.frontend.port);
  }
  
  // Then start module
  await execStart(moduleName);
}

async function killProcessOnPort(port: number): Promise<void> {
  try {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`);
    await sleep(500); // Wait for port to free up
  } catch (error) {
    // Port was already free
  }
}
```

**Benefits:**
- Centralized port management
- Works for all modules
- No per-module changes needed

---

## 📋 Immediate Actions

### Quick Fix (5 minutes):

**1. Add strictPort to Vite configs:**
```typescript
// WorkflowOrchestrator/frontend/vite.config.ts
server: {
  port: parseInt(process.env.FRONTEND_PORT || '5175'),
  strictPort: true, // ← Add this
}
```

**2. Update WorkflowOrchestrator module.json with missing env vars**

**3. Rebuild ModuleImportAgent:**
```bash
cd /home/kevin/Home/ex_nihilo/modules/ModuleImportAgent
npm run build
```

---

### Proper Fix (30 minutes):

**1. Update DeploymentManager** to kill ports before starting

**2. Make all ports environment-variable configurable**

**3. Re-run ModuleImportAgent** on all modules to regenerate module.json files with proper env vars

---

## 🎓 Why This Matters

### Current System:
- Port conflicts → Vite auto-increments → Port sprawl
- Hardcoded ports → Can't customize deployments
- Missing env vars → Modules can't be configured

### After Fix:
- Port conflicts → Old process killed → Clean restart
- Env var ports → Easy customization
- Complete env vars → Proper configuration management

---

## 🚀 Priority

**Priority 1:** Get hierarchical workflow system deployed (backend restart)
**Priority 2:** Fix port management (this issue)
**Priority 3:** Re-scan all modules for complete env var detection

**Current Blocker:** Backend restart still pending, which blocks testing of all new features!

---

Generated: 2025-11-23
Status: Analysis complete - Fixes designed, awaiting deployment

