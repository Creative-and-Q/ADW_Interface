# Implementation Plan: Workflow Conversation Thread System

## Overview

Add a conversation thread feature that allows users to interact with workflows in real-time. AI agents will post comments for every action they take, and users can send messages to pause, interrupt, redirect, or cancel workflow execution.

## Current Architecture Analysis

### Existing Infrastructure
- **Database Tables**: `execution_logs`, `workflows`, `agent_executions`, `artifacts`
- **WebSocket**: Socket.IO with room-based subscriptions (`workflow-${id}`)
- **Events**: `workflow:updated`, `agent:updated`, `artifact:created`
- **Frontend**: WorkflowDetail page with ExecutionLogs component
- **Cancel endpoint**: `DELETE /api/workflows/:id` - marks workflow as failed

### Key Gaps
1. No user-to-workflow messaging system
2. Agents don't post human-readable comments (only technical logs)
3. No mechanism for orchestrator to check for pending user messages
4. No pause/interrupt signals in the agent execution loop

---

## Database Changes

### New Table: `workflow_messages`

```sql
CREATE TABLE workflow_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workflow_id INT NOT NULL,
  agent_execution_id INT NULL,
  message_type ENUM('user', 'agent', 'system') NOT NULL,
  agent_type VARCHAR(50) NULL,
  content TEXT NOT NULL,
  metadata JSON NULL,
  action_type ENUM('comment', 'instruction', 'pause', 'resume', 'cancel', 'redirect') DEFAULT 'comment',
  action_status ENUM('pending', 'acknowledged', 'processed', 'ignored') DEFAULT 'pending',
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),

  INDEX idx_workflow_id (workflow_id),
  INDEX idx_action_status (action_status),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_execution_id) REFERENCES agent_executions(id) ON DELETE SET NULL
);
```

### Modify `workflows` Table

```sql
ALTER TABLE workflows
  ADD COLUMN is_paused BOOLEAN DEFAULT FALSE,
  ADD COLUMN pause_requested_at TIMESTAMP NULL,
  ADD COLUMN pause_reason TEXT NULL;
```

---

## Backend Changes

### 1. New API Endpoints (`api-routes.ts`)

#### POST `/api/workflows/:id/messages`
Send a message to a workflow conversation thread.

```typescript
// Request body
{
  content: string;
  action_type: 'comment' | 'instruction' | 'pause' | 'resume' | 'cancel' | 'redirect';
  metadata?: {
    newTaskDescription?: string;  // For redirect
    skipToAgent?: string;         // For skip actions
    additionalContext?: string;   // Additional context for agents
  };
}

// Response
{
  success: true,
  messageId: number,
  actionTaken?: string  // What action was triggered
}
```

#### GET `/api/workflows/:id/messages`
Get all messages for a workflow conversation thread.

```typescript
// Response
{
  messages: Array<{
    id: number;
    message_type: 'user' | 'agent' | 'system';
    agent_type?: string;
    content: string;
    action_type: string;
    action_status: string;
    created_at: string;
    metadata?: any;
  }>;
}
```

#### POST `/api/workflows/:id/pause`
Pause a running workflow at the next safe checkpoint.

#### POST `/api/workflows/:id/unpause`
Resume a paused workflow.

### 2. New WebSocket Events

```typescript
// Server -> Client
'message:new' - New message added to thread
'workflow:paused' - Workflow has been paused
'workflow:unpaused' - Workflow has been resumed

// Client -> Server (existing)
'subscribe:workflow' - Subscribe to workflow updates
```

### 3. New Module: `workflow-messages.ts`

```typescript
export async function addMessage(
  workflowId: number,
  messageType: 'user' | 'agent' | 'system',
  content: string,
  options?: {
    agentExecutionId?: number;
    agentType?: string;
    actionType?: string;
    metadata?: any;
  }
): Promise<number>;

export async function getMessages(workflowId: number): Promise<Message[]>;

export async function getPendingUserMessages(workflowId: number): Promise<Message[]>;

export async function markMessageProcessed(messageId: number): Promise<void>;

export async function checkForInterrupt(workflowId: number): Promise<InterruptSignal | null>;
```

### 4. Modify `WorkflowOrchestrator/index.ts`

Add interrupt checking at key points in the agent execution loop:

```typescript
// In execute() method, before each agent execution:
async execute(input: AgentInput): Promise<AgentOutput> {
  // ... existing code ...

  for (let i = 0; i < agentSequence.length; i++) {
    const agentType = agentSequence[i];

    // ===== NEW: Check for user interrupts =====
    const interrupt = await this.checkForInterrupt(input.workflowId);
    if (interrupt) {
      if (interrupt.type === 'pause') {
        await this.handlePause(input.workflowId, interrupt);
        // Wait for unpause signal
        await this.waitForUnpause(input.workflowId);
      } else if (interrupt.type === 'cancel') {
        await this.handleCancel(input.workflowId, interrupt);
        return { success: false, artifacts: allArtifacts, summary: 'Cancelled by user' };
      } else if (interrupt.type === 'redirect') {
        // Handle redirect - create new workflow with new instructions
        await this.handleRedirect(input.workflowId, interrupt);
        return { success: true, artifacts: allArtifacts, summary: 'Redirected to new workflow' };
      }
    }

    // ===== NEW: Post agent starting comment =====
    await this.postAgentComment(input.workflowId, agentType, 'starting',
      `Starting ${agentType} agent - ${this.getAgentDescription(agentType)}`);

    // ... existing agent execution code ...

    // ===== NEW: Post agent completion comment =====
    await this.postAgentComment(input.workflowId, agentType, 'completed',
      `${agentType} agent completed: ${agentOutput.summary}`,
      { artifactsCount: agentOutput.artifacts.length });
  }
}

// New helper methods
private async checkForInterrupt(workflowId: number): Promise<InterruptSignal | null>;
private async handlePause(workflowId: number, interrupt: InterruptSignal): Promise<void>;
private async waitForUnpause(workflowId: number): Promise<void>;
private async handleCancel(workflowId: number, interrupt: InterruptSignal): Promise<void>;
private async handleRedirect(workflowId: number, interrupt: InterruptSignal): Promise<void>;
private async postAgentComment(workflowId: number, agentType: string, status: string, message: string, metadata?: any): Promise<void>;
```

### 5. Modify Individual Agent Modules

Each agent (CodingAgent, CodePlannerAgent, etc.) should post comments about their actions:

```typescript
// In the agent's execute() method or agentic loop:

// Post comment when reading a file
await this.postComment(input.workflowId, `Reading file: ${filePath}`);

// Post comment when writing a file
await this.postComment(input.workflowId, `Writing file: ${filePath} (${content.length} bytes)`);

// Post comment when making API calls
await this.postComment(input.workflowId, `Calling AI model for code generation...`);

// Post comment about build results
await this.postComment(input.workflowId, `Build verification: ${result.success ? 'PASSED' : 'FAILED'}`);
```

---

## Frontend Changes

### 1. New Component: `ConversationThread.tsx`

A chat-like interface showing:
- Agent comments (automatic updates)
- User messages
- System notifications (pause, resume, cancel)
- Input field for user messages
- Action buttons (Pause, Cancel, Send Instruction)

```tsx
interface ConversationThreadProps {
  workflowId: number;
  messages: Message[];
  workflowStatus: string;
  isPaused: boolean;
  onSendMessage: (content: string, actionType: string) => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}
```

### 2. Modify `WorkflowDetail.tsx`

Add the ConversationThread component as a new tab or side panel:

```tsx
// New tab option
type ViewMode = 'overview' | 'timeline' | 'conversation';

// Add ConversationThread component
{viewMode === 'conversation' && (
  <ConversationThread
    workflowId={workflow.id}
    messages={messages}
    workflowStatus={workflow.status}
    isPaused={workflow.is_paused}
    onSendMessage={handleSendMessage}
    onPause={handlePause}
    onResume={handleResume}
    onCancel={handleCancel}
  />
)}
```

### 3. Modify `useWebSocket.ts`

Add handlers for new events:

```typescript
// In WorkflowDetail.tsx
socket.on('message:new', (data) => {
  if (data.workflowId === parseInt(id!)) {
    setMessages(prev => [...prev, data.message]);
  }
});

socket.on('workflow:paused', (data) => {
  if (data.workflowId === parseInt(id!)) {
    toast.info('Workflow paused');
    loadWorkflow();
  }
});
```

### 4. New API Service Methods (`api.ts`)

```typescript
export const workflowsAPI = {
  // ... existing methods ...

  getMessages: (id: number) =>
    api.get(`/workflows/${id}/messages`),

  sendMessage: (id: number, content: string, actionType: string, metadata?: any) =>
    api.post(`/workflows/${id}/messages`, { content, action_type: actionType, metadata }),

  pauseWorkflow: (id: number) =>
    api.post(`/workflows/${id}/pause`),

  unpauseWorkflow: (id: number) =>
    api.post(`/workflows/${id}/unpause`),
};
```

---

## Implementation Order

### Phase 1: Database & Core Backend (2-3 files)
1. Create migration for `workflow_messages` table
2. Add `is_paused` columns to `workflows` table
3. Create `workflow-messages.ts` module
4. Add API endpoints for messages

### Phase 2: WorkflowOrchestrator Integration (1 file)
1. Add interrupt checking in agent loop
2. Add pause/wait/resume logic
3. Add agent comment posting
4. Emit WebSocket events for new messages

### Phase 3: Individual Agent Comments (6 files)
1. CodingAgent - post comments for file operations
2. CodePlannerAgent - post comments for planning steps
3. CodeTestingAgent - post comments for test execution
4. CodeReviewAgent - post comments for review findings
5. CodeDocumentationAgent - post comments for docs generation
6. ModuleScaffoldAgent - post comments for scaffolding steps

### Phase 4: Frontend UI (3-4 files)
1. Create ConversationThread component
2. Add messages state and loading to WorkflowDetail
3. Add new tab/panel for conversation view
4. Add message sending UI with action buttons
5. Handle real-time updates via WebSocket

### Phase 5: Testing & Polish
1. Test pause/resume flow
2. Test cancel flow
3. Test redirect flow
4. Test real-time message updates
5. Handle edge cases (workflow already completed, etc.)

---

## Message Flow Examples

### Example 1: User Pauses Workflow

```
[Agent Comment] Starting plan agent - Analyzing codebase and creating implementation plan
[Agent Comment] Reading file: package.json
[Agent Comment] Reading file: src/index.ts
[User Message] Please pause - I need to add something to the requirements
[System] Workflow paused at user request
[User Message] Resume - I've updated the requirements
[System] Workflow resumed
[Agent Comment] Continuing plan agent execution...
```

### Example 2: User Redirects Workflow

```
[Agent Comment] Starting code agent - Implementing code changes
[Agent Comment] Writing file: src/components/Button.tsx
[User Message] REDIRECT: Actually, make this a dropdown menu instead of a button
[System] Creating new workflow with updated instructions...
[System] Original workflow cancelled, new workflow #1234 created
```

### Example 3: User Provides Additional Context

```
[Agent Comment] Starting plan agent - Analyzing codebase
[User Message] Note: The authentication system uses JWT tokens stored in httpOnly cookies
[Agent Comment] Acknowledged user context - will consider JWT cookie auth in implementation
[Agent Comment] Plan completed - 5 sub-tasks identified
```

---

## Technical Considerations

### Polling vs Event-Driven Interrupts

The WorkflowOrchestrator runs in a Node.js process and can't directly receive WebSocket events. Two options:

**Option A: Database Polling (Simpler)**
- Check `workflow_messages` table for pending user actions before each agent
- Check `workflows.is_paused` flag periodically
- ~100ms overhead per check

**Option B: Redis Pub/Sub (More Complex)**
- Publish interrupt signals to Redis channel
- WorkflowOrchestrator subscribes to channel
- Near-instant interrupt delivery
- Requires Redis dependency

**Recommendation**: Start with Database Polling (Option A) for simplicity. Can upgrade to Redis later if latency is an issue.

### Pause Implementation

When paused, the orchestrator should:
1. Mark current agent execution as "paused"
2. Poll for unpause signal every 5 seconds
3. Timeout after 30 minutes (configurable)
4. Log each poll to show the workflow is alive

### Message Deduplication

To prevent the same interrupt being processed multiple times:
1. Mark messages as "acknowledged" when first seen
2. Mark as "processed" when action is complete
3. Only process messages with "pending" status

---

## Files to Create/Modify

### New Files
- `AIDeveloper/migrations/20251129_add_workflow_messages.sql`
- `AIDeveloper/src/workflow-messages.ts`
- `AIDeveloper/frontend/src/components/ConversationThread.tsx`

### Modified Files
- `AIDeveloper/src/api-routes.ts` - Add message endpoints
- `AIDeveloper/src/websocket-emitter.ts` - Add message events
- `AIDeveloper/frontend/src/pages/WorkflowDetail.tsx` - Add conversation tab
- `AIDeveloper/frontend/src/services/api.ts` - Add message API methods
- `AIDeveloper/frontend/src/hooks/useWebSocket.ts` - Handle new events
- `modules/WorkflowOrchestrator/index.ts` - Add interrupt checking and comments
- `modules/CodingAgent/index.ts` - Add action comments
- `modules/CodePlannerAgent/index.ts` - Add action comments
- `modules/CodeTestingAgent/index.ts` - Add action comments
- `modules/CodeReviewAgent/index.ts` - Add action comments
- `modules/CodeDocumentationAgent/index.ts` - Add action comments
- `modules/ModuleScaffoldAgent/index.ts` - Add action comments

---

## Success Criteria

1. Users can see real-time agent comments as they happen
2. Users can pause a workflow and it stops at the next checkpoint
3. Users can resume a paused workflow
4. Users can cancel a workflow with a message
5. Users can send instructions that agents acknowledge
6. All messages appear in a conversation thread UI
7. WebSocket delivers updates in real-time
8. Conversation history persists and can be reviewed
