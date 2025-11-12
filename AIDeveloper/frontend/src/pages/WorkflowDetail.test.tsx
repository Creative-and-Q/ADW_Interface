import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithRouter, screen, waitFor } from '../test/utils';
import WorkflowDetail from './WorkflowDetail';
import { workflowsAPI } from '../services/api';
import { mockWorkflowDetail } from '../test/mockData';
import { Route, Routes } from 'react-router-dom';

vi.mock('../services/api', () => ({
  workflowsAPI: {
    get: vi.fn(),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useNavigate: () => vi.fn(),
  };
});

describe('WorkflowDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.mocked(workflowsAPI.get).mockImplementation(
      () => new Promise(() => {})
    );

    renderWithRouter(<WorkflowDetail />);

    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
  });

  it('loads and displays workflow details', async () => {
    vi.mocked(workflowsAPI.get).mockResolvedValue({ data: mockWorkflowDetail });

    renderWithRouter(<WorkflowDetail />);

    await waitFor(() => {
      expect(screen.getByText('Workflow #1')).toBeInTheDocument();
    });

    expect(screen.getByText('Add user authentication')).toBeInTheDocument();
    expect(screen.getByText('feature', { exact: false })).toBeInTheDocument();
  });

  it('displays workflow status badge', async () => {
    vi.mocked(workflowsAPI.get).mockResolvedValue({ data: mockWorkflowDetail });

    renderWithRouter(<WorkflowDetail />);

    await waitFor(() => {
      expect(screen.getByText('completed')).toBeInTheDocument();
    });
  });

  it('displays task description', async () => {
    vi.mocked(workflowsAPI.get).mockResolvedValue({ data: mockWorkflowDetail });

    renderWithRouter(<WorkflowDetail />);

    await waitFor(() => {
      expect(screen.getByText('Task Description')).toBeInTheDocument();
    });

    expect(screen.getByText('Add user authentication')).toBeInTheDocument();
  });

  it('displays agent execution timeline', async () => {
    vi.mocked(workflowsAPI.get).mockResolvedValue({ data: mockWorkflowDetail });

    renderWithRouter(<WorkflowDetail />);

    await waitFor(() => {
      expect(screen.getByText('Agent Executions')).toBeInTheDocument();
    });

    expect(screen.getByText('Plan Agent')).toBeInTheDocument();
    expect(screen.getByText('Code Agent')).toBeInTheDocument();
    expect(screen.getByText('Planning authentication flow')).toBeInTheDocument();
    expect(screen.getByText('Implementing authentication')).toBeInTheDocument();
  });

  it('displays artifacts section', async () => {
    vi.mocked(workflowsAPI.get).mockResolvedValue({ data: mockWorkflowDetail });

    renderWithRouter(<WorkflowDetail />);

    await waitFor(() => {
      expect(screen.getByText(/Generated Artifacts/)).toBeInTheDocument();
    });

    expect(screen.getByText('code')).toBeInTheDocument();
    expect(screen.getByText('/src/auth/login.ts')).toBeInTheDocument();
  });

  it('shows empty state for agents when none exist', async () => {
    const emptyData = {
      ...mockWorkflowDetail,
      agents: [],
    };
    vi.mocked(workflowsAPI.get).mockResolvedValue({ data: emptyData });

    renderWithRouter(<WorkflowDetail />);

    await waitFor(() => {
      expect(screen.getByText('No agent executions yet')).toBeInTheDocument();
    });
  });

  it('hides artifacts section when none exist', async () => {
    const noArtifacts = {
      ...mockWorkflowDetail,
      artifacts: [],
    };
    vi.mocked(workflowsAPI.get).mockResolvedValue({ data: noArtifacts });

    renderWithRouter(<WorkflowDetail />);

    await waitFor(() => {
      expect(screen.getByText('Workflow #1')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Generated Artifacts/)).not.toBeInTheDocument();
  });

  it('displays back button', async () => {
    vi.mocked(workflowsAPI.get).mockResolvedValue({ data: mockWorkflowDetail });

    renderWithRouter(<WorkflowDetail />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
    });
  });

  it('handles workflow not found', async () => {
    vi.mocked(workflowsAPI.get).mockRejectedValue(new Error('Not found'));

    renderWithRouter(<WorkflowDetail />);

    await waitFor(() => {
      expect(screen.getByText('Workflow not found')).toBeInTheDocument();
    });
  });

  it('displays agent error messages', async () => {
    const workflowWithError = {
      ...mockWorkflowDetail,
      agents: [
        {
          ...mockWorkflowDetail.agents[0],
          status: 'failed',
          error: 'Something went wrong',
        },
      ],
    };
    vi.mocked(workflowsAPI.get).mockResolvedValue({ data: workflowWithError });

    renderWithRouter(<WorkflowDetail />);

    await waitFor(() => {
      expect(screen.getByText('Error: Something went wrong')).toBeInTheDocument();
    });
  });

  it('formats dates correctly', async () => {
    vi.mocked(workflowsAPI.get).mockResolvedValue({ data: mockWorkflowDetail });

    renderWithRouter(<WorkflowDetail />);

    await waitFor(() => {
      expect(screen.getByText(/Nov 10, 2025/)).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(workflowsAPI.get).mockRejectedValue(new Error('API Error'));

    renderWithRouter(<WorkflowDetail />);

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to load workflow:',
        expect.any(Error)
      );
    });

    consoleError.mockRestore();
  });
});
