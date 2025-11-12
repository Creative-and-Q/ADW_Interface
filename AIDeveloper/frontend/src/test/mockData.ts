export const mockWorkflows = [
  {
    id: 1,
    workflow_type: 'feature',
    status: 'completed',
    task_description: 'Add user authentication',
    created_at: '2025-11-10T10:00:00Z',
    updated_at: '2025-11-10T10:30:00Z',
  },
  {
    id: 2,
    workflow_type: 'bugfix',
    status: 'failed',
    task_description: 'Fix login bug',
    created_at: '2025-11-10T11:00:00Z',
    updated_at: '2025-11-10T11:15:00Z',
  },
  {
    id: 3,
    workflow_type: 'refactor',
    status: 'running',
    task_description: 'Refactor database layer',
    created_at: '2025-11-10T12:00:00Z',
    updated_at: '2025-11-10T12:10:00Z',
  },
];

export const mockWorkflowDetail = {
  workflow: {
    id: 1,
    workflow_type: 'feature',
    status: 'completed',
    task_description: 'Add user authentication',
    created_at: '2025-11-10T10:00:00Z',
    updated_at: '2025-11-10T10:30:00Z',
  },
  agents: [
    {
      id: 1,
      workflow_id: 1,
      agent_type: 'plan',
      status: 'completed',
      summary: 'Planning authentication flow',
      created_at: '2025-11-10T10:00:00Z',
      updated_at: '2025-11-10T10:05:00Z',
    },
    {
      id: 2,
      workflow_id: 1,
      agent_type: 'code',
      status: 'completed',
      summary: 'Implementing authentication',
      created_at: '2025-11-10T10:05:00Z',
      updated_at: '2025-11-10T10:20:00Z',
    },
  ],
  artifacts: [
    {
      id: 1,
      workflow_id: 1,
      agent_id: 2,
      artifact_type: 'code',
      file_path: '/src/auth/login.ts',
      created_at: '2025-11-10T10:20:00Z',
    },
  ],
};

export const mockStats = {
  workflows: {
    total: 10,
    completed: 6,
    failed: 2,
    in_progress: 1,
    pending: 1,
  },
  agents: {
    total: 30,
    completed: 25,
    running: 3,
    failed: 2,
  },
  recentActivity: [
    { hour: '00:00', count: 2 },
    { hour: '04:00', count: 5 },
    { hour: '08:00', count: 8 },
    { hour: '12:00', count: 12 },
    { hour: '16:00', count: 10 },
    { hour: '20:00', count: 6 },
  ],
  artifacts: [
    { type: 'code', count: 15 },
    { type: 'tests', count: 10 },
    { type: 'docs', count: 5 },
  ],
};

export const mockPrompts = [
  {
    name: 'plan-agent',
    size: 1024,
  },
  {
    name: 'code-agent',
    size: 2048,
  },
  {
    name: 'test-agent',
    size: 1536,
  },
];

export const mockPromptContent = {
  content: `# Plan Agent Prompt

You are a planning agent responsible for breaking down tasks.

## Your responsibilities:
1. Analyze the task
2. Create a structured plan
3. Identify dependencies`,
};

export const mockErrors = {
  workflows: [
    {
      id: 2,
      workflow_type: 'bugfix',
      status: 'failed',
      task_description: 'Fix login bug',
      error: 'Authentication service unreachable',
      created_at: '2025-11-10T11:00:00Z',
      updated_at: '2025-11-10T11:15:00Z',
    },
  ],
  agents: [
    {
      id: 5,
      workflow_id: 2,
      agent_type: 'code',
      status: 'failed',
      summary: 'Failed to implement fix',
      error: 'Compilation error in auth module',
      output: 'Error: Cannot find module "auth"\n  at line 42',
      created_at: '2025-11-10T11:10:00Z',
      updated_at: '2025-11-10T11:15:00Z',
    },
  ],
};
