import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithRouter, screen, waitFor } from '../test/utils';
import userEvent from '@testing-library/user-event';
import Errors from './Errors';
import { errorsAPI } from '../services/api';
import { mockErrors } from '../test/mockData';

vi.mock('../services/api', () => ({
  errorsAPI: {
    list: vi.fn(),
  },
}));

describe('Errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.mocked(errorsAPI.list).mockImplementation(
      () => new Promise(() => {})
    );

    renderWithRouter(<Errors />);

    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
  });

  it('loads and displays error summary', async () => {
    vi.mocked(errorsAPI.list).mockResolvedValue({ data: mockErrors });

    renderWithRouter(<Errors />);

    await waitFor(() => {
      expect(screen.getByText('Errors & Issues')).toBeInTheDocument();
    });

    expect(screen.getByText('2')).toBeInTheDocument(); // Total errors
    expect(screen.getByText('1')).toBeInTheDocument(); // Failed workflows
  });

  it('displays failed workflows', async () => {
    vi.mocked(errorsAPI.list).mockResolvedValue({ data: mockErrors });

    renderWithRouter(<Errors />);

    await waitFor(() => {
      expect(screen.getByText('Workflow #2')).toBeInTheDocument();
    });

    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
  });

  it('displays failed agents', async () => {
    vi.mocked(errorsAPI.list).mockResolvedValue({ data: mockErrors });

    renderWithRouter(<Errors />);

    await waitFor(() => {
      expect(screen.getByText('Code Agent')).toBeInTheDocument();
    });

    expect(screen.getByText('Failed to implement fix')).toBeInTheDocument();
  });

  it('expands and shows error details', async () => {
    vi.mocked(errorsAPI.list).mockResolvedValue({ data: mockErrors });

    renderWithRouter(<Errors />);

    await waitFor(() => {
      expect(screen.getByText('Workflow #2')).toBeInTheDocument();
    });

    const workflowRow = screen.getByText('Workflow #2').closest('div')!;
    await userEvent.click(workflowRow);

    await waitFor(() => {
      expect(screen.getByText('Authentication service unreachable')).toBeInTheDocument();
    });
  });

  it('expands agent errors and shows output', async () => {
    vi.mocked(errorsAPI.list).mockResolvedValue({ data: mockErrors });

    renderWithRouter(<Errors />);

    await waitFor(() => {
      expect(screen.getByText('Code Agent')).toBeInTheDocument();
    });

    const agentRow = screen.getByText('Code Agent').closest('div')!;
    await userEvent.click(agentRow);

    await waitFor(() => {
      expect(screen.getByText('Compilation error in auth module')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Error: Cannot find module "auth"/)
    ).toBeInTheDocument();
  });

  it('filters errors by type', async () => {
    vi.mocked(errorsAPI.list).mockResolvedValue({ data: mockErrors });

    renderWithRouter(<Errors />);

    await waitFor(() => {
      expect(screen.getByText('Errors & Issues')).toBeInTheDocument();
    });

    const workflowsButton = screen.getByRole('button', { name: /Workflows/i });
    await userEvent.click(workflowsButton);

    expect(screen.getByText(/Failed Workflows \(1\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Failed Agents/)).not.toBeInTheDocument();
  });

  it('filters errors to agents only', async () => {
    vi.mocked(errorsAPI.list).mockResolvedValue({ data: mockErrors });

    renderWithRouter(<Errors />);

    await waitFor(() => {
      expect(screen.getByText('Errors & Issues')).toBeInTheDocument();
    });

    const agentsButton = screen.getByRole('button', { name: /Agents/i });
    await userEvent.click(agentsButton);

    expect(screen.getByText(/Failed Agents \(1\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Failed Workflows/)).not.toBeInTheDocument();
  });

  it('shows all errors when all filter selected', async () => {
    vi.mocked(errorsAPI.list).mockResolvedValue({ data: mockErrors });

    renderWithRouter(<Errors />);

    await waitFor(() => {
      expect(screen.getByText('Errors & Issues')).toBeInTheDocument();
    });

    expect(screen.getByText(/Failed Workflows \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Failed Agents \(1\)/)).toBeInTheDocument();
  });

  it('refreshes errors on button click', async () => {
    vi.mocked(errorsAPI.list).mockResolvedValue({ data: mockErrors });

    renderWithRouter(<Errors />);

    await waitFor(() => {
      expect(screen.getByText('Errors & Issues')).toBeInTheDocument();
    });

    expect(errorsAPI.list).toHaveBeenCalledTimes(1);

    const refreshButton = screen.getByRole('button', { name: /Refresh/i });
    await userEvent.click(refreshButton);

    await waitFor(() => {
      expect(errorsAPI.list).toHaveBeenCalledTimes(2);
    });
  });

  it('displays empty state when no errors', async () => {
    vi.mocked(errorsAPI.list).mockResolvedValue({
      data: { workflows: [], agents: [] },
    });

    renderWithRouter(<Errors />);

    await waitFor(() => {
      expect(screen.getByText('No errors found')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/All workflows and agents are running smoothly/)
    ).toBeInTheDocument();
  });

  it('renders view workflow links', async () => {
    vi.mocked(errorsAPI.list).mockResolvedValue({ data: mockErrors });

    renderWithRouter(<Errors />);

    await waitFor(() => {
      expect(screen.getByText('Errors & Issues')).toBeInTheDocument();
    });

    const viewLinks = screen.getAllByText(/View/i);
    expect(viewLinks.length).toBeGreaterThan(0);
  });

  it('displays info banner', async () => {
    vi.mocked(errorsAPI.list).mockResolvedValue({ data: mockErrors });

    renderWithRouter(<Errors />);

    await waitFor(() => {
      expect(screen.getByText('About Error Tracking')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/This page displays all failed workflows/)
    ).toBeInTheDocument();
  });

  it('formats error dates correctly', async () => {
    vi.mocked(errorsAPI.list).mockResolvedValue({ data: mockErrors });

    renderWithRouter(<Errors />);

    await waitFor(() => {
      expect(screen.getByText(/Nov 10, 2025/)).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(errorsAPI.list).mockRejectedValue(new Error('API Error'));

    renderWithRouter(<Errors />);

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to load errors:',
        expect.any(Error)
      );
    });

    consoleError.mockRestore();
  });

  it('toggles chevron icon on expand', async () => {
    vi.mocked(errorsAPI.list).mockResolvedValue({ data: mockErrors });

    renderWithRouter(<Errors />);

    await waitFor(() => {
      expect(screen.getByText('Workflow #2')).toBeInTheDocument();
    });

    const workflowRow = screen.getByText('Workflow #2').closest('div')!;

    // Click to expand
    await userEvent.click(workflowRow);

    await waitFor(() => {
      expect(screen.getByText('Error Details:')).toBeInTheDocument();
    });

    // Click again to collapse
    await userEvent.click(workflowRow);

    await waitFor(() => {
      expect(screen.queryByText('Error Details:')).not.toBeInTheDocument();
    });
  });

  it('displays workflow type badges', async () => {
    vi.mocked(errorsAPI.list).mockResolvedValue({ data: mockErrors });

    renderWithRouter(<Errors />);

    await waitFor(() => {
      expect(screen.getByText('bugfix')).toBeInTheDocument();
    });
  });
});
