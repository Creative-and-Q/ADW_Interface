#!/bin/bash

# Script to create GitHub repositories for all modules
# This script uses the GitHub CLI (gh)

echo "Creating GitHub repositories for all Ex Nihilo modules..."
echo "=========================================================="
echo ""

MODULES=(
  "AIController"
  "CharacterController"
  "CodeDocumentationAgent"
  "CodePlannerAgent"
  "CodeReviewAgent"
  "CodeTestingAgent"
  "CodingAgent"
  "IntentInterpreter"
  "ItemController"
  "ModuleImportAgent"
  "SceneController"
  "StoryTeller"
  "WorkflowOrchestrator"
)

# First, authenticate if needed
if ! gh auth status &>/dev/null; then
  echo "GitHub CLI not authenticated. Running gh auth login..."
  gh auth login
fi

# Create each repository
for module in "${MODULES[@]}"; do
  echo "Creating repository: $module"

  cd "/home/kevin/Home/ex_nihilo/modules/$module"

  # Create the GitHub repository and push
  if gh repo create "QoobSweet/$module" --public --source=. --remote=origin --push; then
    echo "✓ Successfully created and pushed $module"
  else
    echo "✗ Failed to create $module (may already exist)"
  fi

  echo ""
done

echo "=========================================================="
echo "Done! All repositories have been created and pushed."
