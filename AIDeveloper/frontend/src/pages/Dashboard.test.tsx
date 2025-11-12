import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithRouter, screen, waitFor } from '../test/utils';
import Dashboard from './Dashboard';
import { statsAPI } from '../services/api';
import { mockStats } from '../test/mockData';

vi.mock('../services/api', () => ({
  statsAPI: {
    get: vi.fn(),
  },
}));

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.mocked(statsAPI.get).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithRouter(<Dashboard />);

    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
  });

  it('loads and displays dashboard stats', async () => {
    vi.mocked(statsAPI.get).mockResolvedValue({ data: mockStats });

    renderWithRouter(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    // Check stat cards
    expect(screen.getByText('Total Workflows')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('displays connection status', async () => {
    vi.mocked(statsAPI.get).mockResolvedValue({ data: mockStats });

    renderWithRouter(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });

  it('renders all chart sections', async () => {
    vi.mocked(statsAPI.get).mockResolvedValue({ data: mockStats });

    renderWithRouter(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Activity (24h)')).toBeInTheDocument();
    });

    expect(screen.getByText('Workflow Status')).toBeInTheDocument();
    expect(screen.getByText('Artifacts by Type')).toBeInTheDocument();
    expect(screen.getByText('Agent Executions')).toBeInTheDocument();
  });

  it('displays agent execution stats', async () => {
    vi.mocked(statsAPI.get).mockResolvedValue({ data: mockStats });

    renderWithRouter(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('30')).toBeInTheDocument(); // Total agents
    });

    expect(screen.getByText('25')).toBeInTheDocument(); // Completed
    expect(screen.getByText('3')).toBeInTheDocument(); // Running
  });

  it('handles API errors gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(statsAPI.get).mockRejectedValue(new Error('API Error'));

    renderWithRouter(<Dashboard />);

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to load stats:',
        expect.any(Error)
      );
    });

    consoleError.mockRestore();
  });

  it('renders workflow status legend', async () => {
    vi.mocked(statsAPI.get).mockResolvedValue({ data: mockStats });

    renderWithRouter(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Completed: 6/)).toBeInTheDocument();
    });

    expect(screen.getByText(/Failed: 2/)).toBeInTheDocument();
    expect(screen.getByText(/In Progress: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Pending: 1/)).toBeInTheDocument();
  });

  it('displays trend indicators', async () => {
    vi.mocked(statsAPI.get).mockResolvedValue({ data: mockStats });

    renderWithRouter(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('+12%')).toBeInTheDocument();
    });

    expect(screen.getByText('+8%')).toBeInTheDocument();
    expect(screen.getByText('-3%')).toBeInTheDocument();
  });
});
