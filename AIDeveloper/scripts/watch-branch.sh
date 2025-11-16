#!/bin/bash

##
# Branch Watcher - Auto-rebuild on branch change
# Monitors git branch and rebuilds AIDeveloper + Frontend when branch changes
##

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIDEVELOPER_DIR="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$AIDEVELOPER_DIR/frontend"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get current branch
get_current_branch() {
  git -C "$AIDEVELOPER_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown"
}

# Build AIDeveloper backend
build_backend() {
  echo -e "${BLUE}🔨 Building AIDeveloper backend...${NC}"
  cd "$AIDEVELOPER_DIR"

  if npm run build 2>&1; then
    echo -e "${GREEN}✅ Backend build successful${NC}"
    return 0
  else
    echo -e "${RED}❌ Backend build failed${NC}"
    return 1
  fi
}

# Build frontend
build_frontend() {
  echo -e "${BLUE}🔨 Building frontend...${NC}"

  if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${YELLOW}⚠️  Frontend directory not found at $FRONTEND_DIR${NC}"
    return 1
  fi

  cd "$FRONTEND_DIR"

  if npm run build 2>&1; then
    echo -e "${GREEN}✅ Frontend build successful${NC}"
    return 0
  else
    echo -e "${RED}❌ Frontend build failed${NC}"
    return 1
  fi
}

# Full rebuild
rebuild_all() {
  local branch=$1
  echo ""
  echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
  echo -e "${YELLOW}   Branch changed to: ${GREEN}$branch${NC}"
  echo -e "${YELLOW}   Rebuilding AIDeveloper + Frontend...${NC}"
  echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
  echo ""

  local backend_success=0
  local frontend_success=0

  # Build backend
  if build_backend; then
    backend_success=1
  fi

  # Build frontend
  if build_frontend; then
    frontend_success=1
  fi

  echo ""
  echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
  if [ $backend_success -eq 1 ] && [ $frontend_success -eq 1 ]; then
    echo -e "${GREEN}   ✅ All builds completed successfully!${NC}"
  elif [ $backend_success -eq 1 ]; then
    echo -e "${YELLOW}   ⚠️  Backend OK, Frontend failed${NC}"
  elif [ $frontend_success -eq 1 ]; then
    echo -e "${YELLOW}   ⚠️  Frontend OK, Backend failed${NC}"
  else
    echo -e "${RED}   ❌ Both builds failed${NC}"
  fi
  echo -e "${YELLOW}═══════════════════════════════════════════════════${NC}"
  echo ""
}

# Main watch loop
main() {
  echo -e "${BLUE}👀 Branch Watcher Started${NC}"
  echo -e "${BLUE}Monitoring: $AIDEVELOPER_DIR${NC}"
  echo ""

  # Get initial branch
  current_branch=$(get_current_branch)
  echo -e "${GREEN}Current branch: $current_branch${NC}"
  echo -e "${YELLOW}Watching for branch changes... (Ctrl+C to stop)${NC}"
  echo ""

  # Watch loop
  while true; do
    sleep 2

    new_branch=$(get_current_branch)

    # Check if branch changed
    if [ "$new_branch" != "$current_branch" ]; then
      # Branch changed!
      rebuild_all "$new_branch"
      current_branch=$new_branch

      echo -e "${YELLOW}Continuing to watch for changes...${NC}"
      echo ""
    fi
  done
}

# Handle Ctrl+C gracefully
trap 'echo -e "\n${YELLOW}Branch watcher stopped.${NC}"; exit 0' INT TERM

# Run
main
