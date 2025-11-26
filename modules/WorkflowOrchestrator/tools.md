# WorkflowOrchestrator Tools

This document describes the tools available to the WorkflowOrchestrator agent.

## Available Tools

### orchestrate-workflow.sh

Orchestrates the execution of a workflow by managing agent sequence.

**Parameters:**
- `workflow_id` - The workflow ID to orchestrate
- `workflow_type` - Type of workflow (feature, bugfix, refactor, etc.)

**Example:**
```bash
./tools/orchestrate-workflow.sh "123" "feature"
```

**Description:**
This tool coordinates the execution of multiple agents in the correct sequence based on the workflow type. It manages state transitions and ensures proper data flow between agents.

### manage-agent-sequence.sh

Manages the sequence of agents for a workflow execution.

**Parameters:**
- `workflow_id` - The workflow ID
- `agent_sequence` - Comma-separated list of agent names

**Example:**
```bash
./tools/manage-agent-sequence.sh "123" "CodePlannerAgent,CodingAgent,CodeTestingAgent"
```

**Description:**
Sets up and manages the execution sequence of agents for a workflow. Ensures agents are executed in the correct order and handles dependencies between agents.

### check-workflow-status.sh

Checks the current status of a workflow.

**Parameters:**
- `workflow_id` - The workflow ID to check

**Example:**
```bash
./tools/check-workflow-status.sh "123"
```

**Description:**
Returns the current status of a workflow, including which agents have completed and which are pending.

## Restrictions

- WorkflowOrchestrator can orchestrate workflows but cannot directly execute code changes
- All file operations must go through appropriate agents (CodingAgent, etc.)
- The orchestrator manages coordination, not implementation



