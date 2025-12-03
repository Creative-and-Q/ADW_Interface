---
description: Create a new workflow via the AIDeveloper API
---

# Create New Workflow

Create and execute a new workflow through the AIDeveloper system.

## Variables
type: $1
description: $2
target_module: $3

## Instructions

If the `type` or `description` is not provided, stop and ask the user.

### Supported Workflow Types

| Type | Description |
|------|-------------|
| `feature` | New feature development |
| `bugfix` | Bug fixing workflows |
| `refactor` | Code refactoring |
| `documentation` | Documentation generation |
| `review` | Code review workflows |
| `new_module` | Creating new modules/components |
| `dockerize` | Docker containerization |

### Workflow Creation Process

1. **Validate Input**
   - Ensure workflow type is valid
   - Ensure description is provided and meaningful
   - Target module is optional (restricts agent file edits to that module)

2. **Create Workflow via API**
   Execute the following curl command:

   ```bash
   curl -X POST http://localhost:3001/api/workflows \
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

3. **Monitor Creation**
   - Note the returned workflow ID
   - Check workflow status in the dashboard at http://localhost:5173
   - Or query status via API: `curl http://localhost:3001/api/workflows/{id}`

### Example Usage

```
/new-workflow feature "Add user authentication with JWT tokens" auth-module
/new-workflow bugfix "Fix memory leak in WebSocket connections"
/new-workflow refactor "Split monolithic UserService into smaller services"
/new-workflow documentation "Generate API documentation for all endpoints"
/new-workflow new_module "Create a rate limiting module"
```

## Important Notes

- The workflow will progress through stages: PENDING → PLANNING → CODING → TESTING → REVIEWING → DOCUMENTING → COMPLETED
- Monitor progress in the AIDeveloper dashboard
- If a workflow fails, use `/investigate-workflow {id}` to diagnose
- Use `/auto-fix-workflow {id}` to automatically fix and retry failed workflows
- Workflows are isolated in their own working directories under `workflows/`

## After Creation

Report the workflow ID and provide:
1. Direct dashboard link: `http://localhost:5173/workflows/{id}`
2. API status endpoint: `http://localhost:3001/api/workflows/{id}`
3. Next steps for monitoring

---

**Creating workflow: ${type} - ${description}**
