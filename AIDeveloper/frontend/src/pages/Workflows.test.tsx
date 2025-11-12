import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithRouter, screen, waitFor, fireEvent } from '../test/utils';
import userEvent from '@testing-library/user-event';
import Workflows from './Workflows';
import { workflowsAPI } from '../services/api';
import { mockWorkflows } from '../test/mockData';

vi.mock('../services/api', () => ({
  workflowsAPI: {
    list: vi.fn(),
    create: vi.fn(),
  },
}));

describe('Workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.mocked(workflowsAPI.list).mockImplementation(
      () => new Promise(() => {})
    );

    renderWithRouter(<Workflows />);

    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
  });

  it('loads and displays workflows', async () => {
    vi.mocked(workflowsAPI.list).mockResolvedValue({
      data: { workflows: mockWorkflows },
    });

    renderWithRouter(<Workflows />);

    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
  });

  it('displays workflow types correctly', async () => {
    vi.mocked(workflowsAPI.list).mockResolvedValue({
      data: { workflows: mockWorkflows },
    });

    renderWithRouter(<Workflows />);

    await waitFor(() => {
      expect(screen.getByText('feature')).toBeInTheDocument();
    });

    expect(screen.getByText('bugfix')).toBeInTheDocument();
    expect(screen.getByText('refactor')).toBeInTheDocument();
  });

  it('filters workflows by status', async () => {
    vi.mocked(workflowsAPI.list).mockResolvedValue({
      data: { workflows: mockWorkflows },
    });

    renderWithRouter(<Workflows />);

    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });

    const completedButton = screen.getByRole('button', { name: /Completed/i });
    await userEvent.click(completedButton);

    await waitFor(() => {
      expect(workflowsAPI.list).toHaveBeenCalledWith({ status: 'completed' });
    });
  });

  it('opens create workflow modal', async () => {
    vi.mocked(workflowsAPI.list).mockResolvedValue({
      data: { workflows: mockWorkflows },
    });

    renderWithRouter(<Workflows />);

    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });

    const newWorkflowButton = screen.getByRole('button', {
      name: /New Workflow/i,
    });
    await userEvent.click(newWorkflowButton);

    expect(screen.getByText('Create New Workflow')).toBeInTheDocument();
    expect(screen.getByLabelText('Workflow Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Task Description')).toBeInTheDocument();
  });

  it('creates a new workflow', async () => {
    vi.mocked(workflowsAPI.list).mockResolvedValue({
      data: { workflows: mockWorkflows },
    });
    vi.mocked(workflowsAPI.create).mockResolvedValue({ data: { id: 4 } });

    renderWithRouter(<Workflows />);

    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });

    const newWorkflowButton = screen.getByRole('button', {
      name: /New Workflow/i,
    });
    await userEvent.click(newWorkflowButton);

    const typeSelect = screen.getByLabelText('Workflow Type');
    await userEvent.selectOptions(typeSelect, 'feature');

    const descriptionTextarea = screen.getByLabelText('Task Description');
    await userEvent.type(descriptionTextarea, 'New feature implementation');

    const createButton = screen.getByRole('button', { name: /^Create$/i });
    await userEvent.click(createButton);

    await waitFor(() => {
      expect(workflowsAPI.create).toHaveBeenCalledWith({
        workflowType: 'feature',
        taskDescription: 'New feature implementation',
      });
    });
  });

  it('closes modal on cancel', async () => {
    vi.mocked(workflowsAPI.list).mockResolvedValue({
      data: { workflows: mockWorkflows },
    });

    renderWithRouter(<Workflows />);

    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });

    const newWorkflowButton = screen.getByRole('button', {
      name: /New Workflow/i,
    });
    await userEvent.click(newWorkflowButton);

    expect(screen.getByText('Create New Workflow')).toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    await userEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText('Create New Workflow')).not.toBeInTheDocument();
    });
  });

  it('refreshes workflows on button click', async () => {
    vi.mocked(workflowsAPI.list).mockResolvedValue({
      data: { workflows: mockWorkflows },
    });

    renderWithRouter(<Workflows />);

    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });

    expect(workflowsAPI.list).toHaveBeenCalledTimes(1);

    const refreshButton = screen.getByRole('button', { name: /Refresh/i });
    await userEvent.click(refreshButton);

    await waitFor(() => {
      expect(workflowsAPI.list).toHaveBeenCalledTimes(2);
    });
  });

  it('displays empty state when no workflows', async () => {
    vi.mocked(workflowsAPI.list).mockResolvedValue({
      data: { workflows: [] },
    });

    renderWithRouter(<Workflows />);

    await waitFor(() => {
      expect(screen.getByText('No workflows found')).toBeInTheDocument();
    });
  });

  it('renders view details links', async () => {
    vi.mocked(workflowsAPI.list).mockResolvedValue({
      data: { workflows: mockWorkflows },
    });

    renderWithRouter(<Workflows />);

    await waitFor(() => {
      expect(screen.getByText('Workflows')).toBeInTheDocument();
    });

    const viewDetailsLinks = screen.getAllByText('View Details');
    expect(viewDetailsLinks).toHaveLength(mockWorkflows.length);
  });

  it('handles API errors gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(workflowsAPI.list).mockRejectedValue(new Error('API Error'));

    renderWithRouter(<Workflows />);

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to load workflows:',
        expect.any(Error)
      );
    });

    consoleError.mockRestore();
  });
});
