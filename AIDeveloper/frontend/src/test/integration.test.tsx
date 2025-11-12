import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderApp, screen, waitFor } from './utils';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { statsAPI, workflowsAPI, promptsAPI, errorsAPI } from '../services/api';
import {
  mockStats,
  mockWorkflows,
  mockWorkflowDetail,
  mockPrompts,
  mockPromptContent,
  mockErrors,
} from './mockData';

vi.mock('../services/api', () => ({
  statsAPI: { get: vi.fn() },
  workflowsAPI: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
  },
  promptsAPI: {
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
  },
  errorsAPI: { list: vi.fn() },
}));

describe('End-to-End Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes full workflow creation flow', async () => {
    // Setup mocks
    vi.mocked(statsAPI.get).mockResolvedValue({ data: mockStats });
    vi.mocked(workflowsAPI.list).mockResolvedValue({
      data: { workflows: mockWorkflows },
    });
    vi.mocked(workflowsAPI.create).mockResolvedValue({ data: { id: 4 } });

    renderApp(<App />);

    // Navigate to Workflows
    const workflowsLink = screen.getByRole('link', { name: /Workflows/i });
    await userEvent.click(workflowsLink);

    await waitFor(() => {
      expect(screen.getByText('Monitor and manage all development workflows')).toBeInTheDocument();
    });

    // Open create modal
    const newWorkflowButton = screen.getByRole('button', {
      name: /New Workflow/i,
    });
    await userEvent.click(newWorkflowButton);

    // Fill form
    const typeSelect = screen.getByLabelText('Workflow Type');
    await userEvent.selectOptions(typeSelect, 'feature');

    const descriptionTextarea = screen.getByLabelText('Task Description');
    await userEvent.type(descriptionTextarea, 'Add new feature');

    // Submit
    const createButton = screen.getByRole('button', { name: /^Create$/i });
    await userEvent.click(createButton);

    // Verify API call
    await waitFor(() => {
      expect(workflowsAPI.create).toHaveBeenCalledWith({
        workflowType: 'feature',
        taskDescription: 'Add new feature',
      });
    });
  });

  it('navigates through all pages and displays correct content', async () => {
    // Setup all mocks
    vi.mocked(statsAPI.get).mockResolvedValue({ data: mockStats });
    vi.mocked(workflowsAPI.list).mockResolvedValue({
      data: { workflows: mockWorkflows },
    });
    vi.mocked(promptsAPI.list).mockResolvedValue({
      data: { prompts: mockPrompts },
    });
    vi.mocked(promptsAPI.get).mockResolvedValue({ data: mockPromptContent });
    vi.mocked(errorsAPI.list).mockResolvedValue({ data: mockErrors });

    renderApp(<App />);

    // Dashboard
    await waitFor(() => {
      expect(screen.getByText('Real-time overview of your AI development workflows')).toBeInTheDocument();
    });
    expect(screen.getByText('10')).toBeInTheDocument(); // Total workflows

    // Workflows
    const workflowsLink = screen.getByRole('link', { name: /Workflows/i });
    await userEvent.click(workflowsLink);
    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    // Prompts
    const promptsLink = screen.getByRole('link', { name: /Prompts/i });
    await userEvent.click(promptsLink);
    await waitFor(() => {
      expect(screen.getByText('plan')).toBeInTheDocument();
    });

    // Errors
    const errorsLink = screen.getByRole('link', { name: /Errors/i });
    await userEvent.click(errorsLink);
    await waitFor(() => {
      expect(screen.getByText('Workflow #2')).toBeInTheDocument();
    });

    // Back to Dashboard
    const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
    await userEvent.click(dashboardLink);
    await waitFor(() => {
      expect(screen.getByText('Real-time overview of your AI development workflows')).toBeInTheDocument();
    });
  });

  it('edits and saves a prompt', async () => {
    vi.mocked(promptsAPI.list).mockResolvedValue({
      data: { prompts: mockPrompts },
    });
    vi.mocked(promptsAPI.get).mockResolvedValue({ data: mockPromptContent });
    vi.mocked(promptsAPI.update).mockResolvedValue({ data: { success: true } });

    renderApp(<App />);

    // Navigate to Prompts
    const promptsLink = screen.getByRole('link', { name: /Prompts/i });
    await userEvent.click(promptsLink);

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });

    // Edit content
    const editor = screen.getByTestId('monaco-editor');
    await userEvent.clear(editor);
    await userEvent.type(editor, 'Updated prompt content');

    // Save
    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(promptsAPI.update).toHaveBeenCalledWith(
        'plan-agent',
        'Updated prompt content'
      );
    });

    expect(screen.getByText('Saved!')).toBeInTheDocument();
  });

  it('filters workflows and views details', async () => {
    vi.mocked(workflowsAPI.list).mockResolvedValue({
      data: { workflows: mockWorkflows },
    });
    vi.mocked(workflowsAPI.get).mockResolvedValue({ data: mockWorkflowDetail });

    renderApp(<App />);

    // Navigate to Workflows
    const workflowsLink = screen.getByRole('link', { name: /Workflows/i });
    await userEvent.click(workflowsLink);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    // Filter by completed
    const completedButton = screen.getByRole('button', { name: /Completed/i });
    await userEvent.click(completedButton);

    await waitFor(() => {
      expect(workflowsAPI.list).toHaveBeenCalledWith({ status: 'completed' });
    });
  });

  it('expands error details and navigates to workflow', async () => {
    vi.mocked(errorsAPI.list).mockResolvedValue({ data: mockErrors });
    vi.mocked(workflowsAPI.get).mockResolvedValue({ data: mockWorkflowDetail });

    renderApp(<App />);

    // Navigate to Errors
    const errorsLink = screen.getByRole('link', { name: /Errors/i });
    await userEvent.click(errorsLink);

    await waitFor(() => {
      expect(screen.getByText('Workflow #2')).toBeInTheDocument();
    });

    // Expand error
    const workflowRow = screen.getByText('Workflow #2').closest('div')!;
    await userEvent.click(workflowRow);

    await waitFor(() => {
      expect(screen.getByText('Authentication service unreachable')).toBeInTheDocument();
    });
  });

  it('handles WebSocket connection status', async () => {
    vi.mocked(statsAPI.get).mockResolvedValue({ data: mockStats });

    renderApp(<App />);

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    // Verify live indicator
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('maintains navigation state across page transitions', async () => {
    vi.mocked(statsAPI.get).mockResolvedValue({ data: mockStats });
    vi.mocked(workflowsAPI.list).mockResolvedValue({
      data: { workflows: mockWorkflows },
    });

    renderApp(<App />);

    // Start on Dashboard
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Dashboard/i })).toHaveClass('bg-primary-800');
    });

    // Navigate to Workflows
    const workflowsLink = screen.getByRole('link', { name: /Workflows/i });
    await userEvent.click(workflowsLink);

    await waitFor(() => {
      expect(workflowsLink).toHaveClass('bg-primary-800');
    });

    // Dashboard should no longer be active
    expect(screen.getByRole('link', { name: /Dashboard/i })).not.toHaveClass('bg-primary-800');
  });

  it('refreshes data on button clicks', async () => {
    vi.mocked(workflowsAPI.list).mockResolvedValue({
      data: { workflows: mockWorkflows },
    });

    renderApp(<App />);

    // Navigate to Workflows
    const workflowsLink = screen.getByRole('link', { name: /Workflows/i });
    await userEvent.click(workflowsLink);

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    expect(workflowsAPI.list).toHaveBeenCalledTimes(1);

    // Click refresh
    const refreshButton = screen.getByRole('button', { name: /Refresh/i });
    await userEvent.click(refreshButton);

    await waitFor(() => {
      expect(workflowsAPI.list).toHaveBeenCalledTimes(2);
    });
  });
});
