---
description: Quick workflow creation templates for all workflow types
---

# Quick Workflow Creator

Quickly create workflows with pre-filled templates.

## Usage

```
/quick-workflow <type> <description> [target_module]
```

## Variables
type: $1
description: $2
target_module: $3

## Validation

If type or description is missing, show this help:

```
Quick Workflow Types:

  feature       - New feature development
  bugfix        - Bug fixing
  refactor      - Code refactoring
  documentation - Generate documentation
  review        - Code review
  new_module    - Create new module
  dockerize     - Docker containerization

Examples:
  /quick-workflow feature "Add user authentication"
  /quick-workflow bugfix "Fix memory leak in WebSocket" core
  /quick-workflow refactor "Split UserService into smaller services" users
  /quick-workflow documentation "Document all API endpoints"
  /quick-workflow new_module "Create rate limiting module"
```

## Workflow Templates

### Feature Workflow
```json
{
  "type": "feature",
  "payload": {
    "source": "manual",
    "targetModule": "${target_module}",
    "customData": {
      "description": "${description}",
      "workflowHints": {
        "createTests": true,
        "generateDocs": true,
        "requireReview": true
      }
    }
  }
}
```

### Bugfix Workflow
```json
{
  "type": "bugfix",
  "payload": {
    "source": "manual",
    "targetModule": "${target_module}",
    "customData": {
      "description": "${description}",
      "workflowHints": {
        "runExistingTests": true,
        "minimalChanges": true,
        "verifyFix": true
      }
    }
  }
}
```

### Refactor Workflow
```json
{
  "type": "refactor",
  "payload": {
    "source": "manual",
    "targetModule": "${target_module}",
    "customData": {
      "description": "${description}",
      "workflowHints": {
        "preserveBehavior": true,
        "updateTests": true,
        "improveReadability": true
      }
    }
  }
}
```

### Documentation Workflow
```json
{
  "type": "documentation",
  "payload": {
    "source": "manual",
    "targetModule": "${target_module}",
    "customData": {
      "description": "${description}",
      "workflowHints": {
        "generateApiDocs": true,
        "includeExamples": true,
        "updateReadme": true
      }
    }
  }
}
```

### Review Workflow
```json
{
  "type": "review",
  "payload": {
    "source": "manual",
    "targetModule": "${target_module}",
    "customData": {
      "description": "${description}",
      "workflowHints": {
        "securityReview": true,
        "performanceReview": true,
        "codeQuality": true
      }
    }
  }
}
```

### New Module Workflow
```json
{
  "type": "new_module",
  "payload": {
    "source": "manual",
    "customData": {
      "description": "${description}",
      "workflowHints": {
        "generateManifest": true,
        "scaffoldStructure": true,
        "includeTests": true
      }
    }
  }
}
```

### Dockerize Workflow
```json
{
  "type": "dockerize",
  "payload": {
    "source": "manual",
    "targetModule": "${target_module}",
    "customData": {
      "description": "${description}",
      "workflowHints": {
        "createDockerfile": true,
        "createComposeFile": true,
        "optimizeImage": true
      }
    }
  }
}
```

## Execution

Create the workflow:

```bash
cd AIDeveloper && curl -X POST http://localhost:3001/api/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "type": "${type}",
    "payload": {
      "source": "manual",
      "targetModule": "${target_module}",
      "customData": {
        "description": "${description}"
      }
    }
  }'
```

## Post-Creation

After creating the workflow:

1. **Dashboard**: http://localhost:5173/workflows/{id}
2. **Monitor**: `/monitor-workflows`
3. **If fails**: `/investigate-workflow {id}`
4. **Auto-fix**: `/auto-fix-workflow {id}`

---

**Creating ${type} workflow: ${description}**
