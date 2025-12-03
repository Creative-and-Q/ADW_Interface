#!/bin/bash
###############################################################################
# SSH Setup Script for Workflows
# Ensures SSH is properly configured for all git operations
###############################################################################

set -e

echo "🔐 Setting up SSH for workflow git operations..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

###############################################################################
# 1. Check SSH directory and keys
###############################################################################

echo ""
echo "📁 Step 1: Checking SSH directory and keys..."

SSH_DIR="$HOME/.ssh"
if [ ! -d "$SSH_DIR" ]; then
    echo -e "${YELLOW}Creating SSH directory...${NC}"
    mkdir -p "$SSH_DIR"
    chmod 700 "$SSH_DIR"
fi

# Use SSH_KEY_NAME env var if set, otherwise auto-detect (prefer ed25519)
SSH_KEY=""
if [ -n "$SSH_KEY_NAME" ] && [ -f "$SSH_DIR/$SSH_KEY_NAME" ]; then
    SSH_KEY="$SSH_DIR/$SSH_KEY_NAME"
elif [ -f "$SSH_DIR/id_ed25519" ]; then SSH_KEY="$SSH_DIR/id_ed25519"
elif [ -f "$SSH_DIR/id_rsa" ]; then SSH_KEY="$SSH_DIR/id_rsa"
elif [ -f "$SSH_DIR/id_ecdsa" ]; then SSH_KEY="$SSH_DIR/id_ecdsa"
else
    echo -e "${RED}ERROR: No SSH key found${NC}"
    echo "Please generate an SSH key and add it to GitHub:"
    echo "  ssh-keygen -t ed25519 -C 'your_email@example.com'"
    echo "  cat ~/.ssh/id_ed25519.pub  # Add this to GitHub"
    echo "Or set SSH_KEY_NAME env var to your key name"
    exit 1
fi

echo "Using SSH key: $SSH_KEY"

# Set correct permissions
chmod 700 "$SSH_DIR"
chmod 600 "$SSH_KEY"
chmod 644 "${SSH_KEY}.pub" 2>/dev/null || true
chmod 600 "$SSH_DIR/config" 2>/dev/null || true

echo -e "${GREEN}✓ SSH directory and keys configured${NC}"

###############################################################################
# 2. Configure SSH for GitHub
###############################################################################

echo ""
echo "⚙️  Step 2: Configuring SSH for GitHub..."

cat > "$SSH_DIR/config" <<EOF
# GitHub Configuration
Host github.com
    HostName github.com
    User git
    IdentityFile $SSH_KEY
    IdentitiesOnly yes
    StrictHostKeyChecking accept-new
    UserKnownHostsFile $SSH_DIR/known_hosts
    AddKeysToAgent yes
    ForwardAgent no

# Default for all hosts
Host *
    IdentityFile $SSH_KEY
    IdentitiesOnly yes
    StrictHostKeyChecking accept-new
    ServerAliveInterval 60
    ServerAliveCountMax 10
EOF

chmod 600 "$SSH_DIR/config"

echo -e "${GREEN}✓ SSH config updated${NC}"

###############################################################################
# 3. Add GitHub to known_hosts
###############################################################################

echo ""
echo "🔑 Step 3: Adding GitHub to known_hosts..."

# Only add GitHub if not already present
if ! ssh-keygen -F github.com > /dev/null 2>&1; then
    ssh-keyscan -t rsa,ecdsa,ed25519 github.com >> "$SSH_DIR/known_hosts" 2>/dev/null
    echo -e "${GREEN}✓ GitHub added to known_hosts${NC}"
else
    echo -e "${GREEN}✓ GitHub already in known_hosts${NC}"
fi

###############################################################################
# 4. Test SSH connection to GitHub
###############################################################################

echo ""
echo "🧪 Step 4: Testing SSH connection to GitHub..."

if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
    echo -e "${GREEN}✓ Successfully authenticated with GitHub!${NC}"
else
    echo -e "${RED}✗ Failed to authenticate with GitHub${NC}"
    echo "Please check:"
    echo "  1. SSH key is added to GitHub (https://github.com/settings/keys)"
    echo "  2. SSH key permissions are correct (chmod 600 $SSH_KEY)"
    echo "  3. SSH agent is running (eval \$(ssh-agent -s))"
    exit 1
fi

###############################################################################
# 5. Configure Git to use SSH
###############################################################################

echo ""
echo "🔧 Step 5: Configuring Git..."

# Set git to use SSH for GitHub
git config --global url."git@github.com:".insteadOf "https://github.com/"

# Configure git SSH command with verbose logging for debugging
git config --global core.sshCommand "ssh -i $SSH_KEY -F $SSH_DIR/config"

# Set git user (if not already set)
if [ -z "$(git config --global user.name)" ]; then
    git config --global user.name "AIDeveloper Bot"
fi

if [ -z "$(git config --global user.email)" ]; then
    git config --global user.email "bot@aideveloper.local"
fi

echo -e "${GREEN}✓ Git configured to use SSH${NC}"

###############################################################################
# 6. Start SSH agent and add key
###############################################################################

echo ""
echo "🚀 Step 6: Setting up SSH agent..."

# Start SSH agent if not running
if [ -z "$SSH_AUTH_SOCK" ]; then
    eval "$(ssh-agent -s)" > /dev/null
    echo -e "${GREEN}✓ SSH agent started${NC}"
else
    echo -e "${GREEN}✓ SSH agent already running${NC}"
fi

# Add key to agent
ssh-add "$SSH_KEY" 2>/dev/null && echo -e "${GREEN}✓ SSH key added to agent${NC}" || echo -e "${YELLOW}⚠ Could not add key to agent (may already be added)${NC}"

###############################################################################
# 7. Create persistent SSH agent configuration
###############################################################################

echo ""
echo "💾 Step 7: Creating persistent SSH agent configuration..."

# Add to shell profile for persistence
SHELL_RC="$HOME/.bashrc"
if [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
fi

# Add SSH agent auto-start to shell profile if not already present
if ! grep -q "SSH_ENV=" "$SHELL_RC" 2>/dev/null; then
    cat >> "$SHELL_RC" <<EOF

# SSH Agent Auto-start
SSH_ENV="\$HOME/.ssh/agent-environment"

function start_agent {
    echo "Initialising new SSH agent..."
    ssh-agent | sed 's/^echo/#echo/' > "\${SSH_ENV}"
    chmod 600 "\${SSH_ENV}"
    . "\${SSH_ENV}" > /dev/null
    # Auto-detect and add SSH key
    for key in ~/.ssh/id_ed25519 ~/.ssh/id_rsa ~/.ssh/id_ecdsa; do
        if [ -f "\$key" ]; then ssh-add "\$key" 2>/dev/null; break; fi
    done
}

# Source SSH agent settings if file exists
if [ -f "\${SSH_ENV}" ]; then
    . "\${SSH_ENV}" > /dev/null
    # Check if agent is still running
    ps -ef | grep \${SSH_AGENT_PID} | grep ssh-agent$ > /dev/null || {
        start_agent;
    }
else
    start_agent;
fi
EOF
    echo -e "${GREEN}✓ SSH agent auto-start added to $SHELL_RC${NC}"
fi

###############################################################################
# 8. Create environment file for workflows
###############################################################################

echo ""
echo "📝 Step 8: Creating SSH environment file for workflows..."

cat > "$SSH_DIR/agent-environment" <<EOF
SSH_AUTH_SOCK=$SSH_AUTH_SOCK; export SSH_AUTH_SOCK;
SSH_AGENT_PID=$SSH_AGENT_PID; export SSH_AGENT_PID;
GIT_SSH_COMMAND='ssh -i $SSH_KEY -F $SSH_DIR/config'; export GIT_SSH_COMMAND;
EOF

chmod 600 "$SSH_DIR/agent-environment"

echo -e "${GREEN}✓ SSH environment file created${NC}"

###############################################################################
# Summary
###############################################################################

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ SSH Setup Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Configuration:"
echo "  • SSH Dir: $SSH_DIR"
echo "  • SSH Key: $SSH_KEY"
echo "  • SSH Config: $SSH_DIR/config"
echo "  • Agent Socket: $SSH_AUTH_SOCK"
echo "  • Agent PID: $SSH_AGENT_PID"
echo ""
echo "To use in workflows:"
echo "  source $SSH_DIR/agent-environment"
echo ""
echo "To test manually:"
echo "  ssh -T git@github.com"
echo "  git clone git@github.com:user/repo.git"
echo ""
