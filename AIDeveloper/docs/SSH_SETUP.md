# SSH Setup for Workflows

## Overview

This document describes the SSH configuration setup for workflows to perform git operations reliably.

## Problem

Workflows were failing during git clone operations because:
1. The server runs as the `root` user
2. SSH config was pointing to `/home/kevin/.ssh/id_rsa` instead of `/root/.ssh/id_rsa`
3. SSH agent was not consistently available for workflow processes

## Solution

### 1. SSH Setup Script

**Location:** `AIDeveloper/scripts/setup-ssh.sh`

This comprehensive script:
- ✅ Checks SSH directory and keys exist with correct permissions
- ✅ Configures SSH specifically for GitHub with proper settings
- ✅ Adds GitHub to known_hosts automatically
- ✅ Tests SSH connection to verify it works
- ✅ Configures Git to use SSH with proper command
- ✅ Sets up SSH agent with persistence across sessions
- ✅ Creates environment file for workflows to source

**Usage:**
```bash
bash AIDeveloper/scripts/setup-ssh.sh
```

### 2. Automatic SSH Configuration on Server Start

**Location:** `AIDeveloper/scripts/ensure-services.sh`

The service startup script now includes SSH configuration checks:
- Checks if SSH agent is running
- Sources SSH environment if available
- Runs setup script if SSH is not configured
- Ensures SSH is ready before server starts

### 3. Workflow Integration

**Location:** `AIDeveloper/src/utils/workflow-directory-manager.ts`

Added `getSSHEnvironment()` function that:
- Loads SSH environment variables from `/root/.ssh/agent-environment`
- Parses `SSH_AUTH_SOCK`, `SSH_AGENT_PID`, and `GIT_SSH_COMMAND`
- Falls back to direct SSH command if environment file not found
- Used by `cloneRepository()` to ensure git clone has SSH access

**Code:**
```typescript
function getSSHEnvironment(): NodeJS.ProcessEnv {
  const sshEnvFile = path.join(process.env.HOME || '/root', '.ssh', 'agent-environment');

  try {
    const envContent = require('fs').readFileSync(sshEnvFile, 'utf-8');
    const env: NodeJS.ProcessEnv = { ...process.env };

    // Parse the environment file
    const matches = envContent.matchAll(/([A-Z_]+)=([^;]+);/g);
    for (const match of matches) {
      const [, key, value] = match;
      env[key] = value.replace(/^['"]|['"]$/g, '');
    }

    return env;
  } catch (error) {
    return {
      ...process.env,
      GIT_SSH_COMMAND: 'ssh -i /root/.ssh/id_rsa -F /root/.ssh/config',
    };
  }
}
```

## SSH Configuration Files

### /root/.ssh/config
```
# GitHub Configuration
Host github.com
    HostName github.com
    User git
    IdentityFile /root/.ssh/id_rsa
    IdentitiesOnly yes
    StrictHostKeyChecking accept-new
    UserKnownHostsFile /root/.ssh/known_hosts
    AddKeysToAgent yes
    ForwardAgent no

# Default for all hosts
Host *
    IdentityFile /root/.ssh/id_rsa
    IdentitiesOnly yes
    StrictHostKeyChecking accept-new
    ServerAliveInterval 60
    ServerAliveCountMax 10
```

### /root/.ssh/agent-environment
```bash
SSH_AUTH_SOCK=/tmp/ssh-xxx/agent.xxx; export SSH_AUTH_SOCK;
SSH_AGENT_PID=xxx; export SSH_AGENT_PID;
GIT_SSH_COMMAND='ssh -i /root/.ssh/id_rsa -F /root/.ssh/config'; export GIT_SSH_COMMAND;
```

## Testing

### Manual Test
```bash
# Test SSH connection
ssh -T git@github.com

# Test git clone
cd /tmp
git clone git@github.com:QoobSweet/ex_nihilo.git test-clone
rm -rf test-clone
```

### Workflow Test
Create a new workflow and verify it can successfully clone the repository during initialization.

## Troubleshooting

### SSH Agent Not Running
```bash
# Check if agent is running
ps aux | grep ssh-agent

# Restart agent
bash AIDeveloper/scripts/setup-ssh.sh
```

### Git Clone Still Failing
```bash
# Verify SSH keys exist
ls -la /root/.ssh/

# Test GitHub authentication
ssh -T git@github.com

# Check git config
git config --global --list | grep ssh

# Re-run setup
bash AIDeveloper/scripts/setup-ssh.sh
```

### Environment Variables Not Set
```bash
# Source environment manually
source /root/.ssh/agent-environment

# Verify variables
echo $SSH_AUTH_SOCK
echo $SSH_AGENT_PID
echo $GIT_SSH_COMMAND
```

## Impact on Previous Workflows

This fixes the recurring git clone failures seen in:
- Workflow 100
- Workflow 101
- Workflow 104
- Workflow 107
- And any other workflows that attempted git operations

All future workflows will now have reliable SSH access for git operations.
