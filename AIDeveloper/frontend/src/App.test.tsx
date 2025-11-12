import { describe, it, expect, vi } from 'vitest';
import { renderApp, screen, waitFor } from './test/utils';
import userEvent from '@testing-library/user-event';
import App from './App';
import { statsAPI, workflowsAPI, errorsAPI, promptsAPI } from './services/api';
import { mockStats, mockWorkflows, mockErrors, mockPrompts } from './test/mockData';

vi.mock('./services/api', () => ({
  statsAPI: { get: vi.fn() },
  workflowsAPI: { list: vi.fn(), get: vi.fn() },
  errorsAPI: { list: vi.fn() },
  promptsAPI: { list: vi.fn(), get: vi.fn() },
}));

describe('App', () => {
  it('renders navigation header', () => {
    renderApp(<App />);

    expect(screen.getByText('AIDeveloper')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders all navigation links', () => {
    renderApp(<App />);

    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Workflows/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Prompts/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Errors/i })).toBeInTheDocument();
  });

  it('navigates to Dashboard page', async () => {
    vi.mocked(statsAPI.get).mockResolvedValue({ data: mockStats });

    renderApp(<App />);

    const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
    await userEvent.click(dashboardLink);

    await waitFor(() => {
      expect(screen.getByText('Real-time overview of your AI development workflows')).toBeInTheDocument();
    });
  });

  it('navigates to Workflows page', async () => {
    vi.mocked(workflowsAPI.list).mockResolvedValue({ data: { workflows: mockWorkflows } });

    renderApp(<App />);

    const workflowsLink = screen.getByRole('link', { name: /Workflows/i });
    await userEvent.click(workflowsLink);

    await waitFor(() => {
      expect(screen.getByText('Monitor and manage all development workflows')).toBeInTheDocument();
    });
  });

  it('navigates to Prompts page', async () => {
    vi.mocked(promptsAPI.list).mockResolvedValue({ data: { prompts: mockPrompts } });
    vi.mocked(promptsAPI.get).mockResolvedValue({ data: { content: 'Test' } });

    renderApp(<App />);

    const promptsLink = screen.getByRole('link', { name: /Prompts/i });
    await userEvent.click(promptsLink);

    await waitFor(() => {
      expect(screen.getByText('View and edit agent system prompts')).toBeInTheDocument();
    });
  });

  it('navigates to Errors page', async () => {
    vi.mocked(errorsAPI.list).mockResolvedValue({ data: mockErrors });

    renderApp(<App />);

    const errorsLink = screen.getByRole('link', { name: /Errors/i });
    await userEvent.click(errorsLink);

    await waitFor(() => {
      expect(screen.getByText('Track and debug workflow and agent failures')).toBeInTheDocument();
    });
  });

  it('highlights active navigation link', async () => {
    vi.mocked(workflowsAPI.list).mockResolvedValue({ data: { workflows: mockWorkflows } });

    renderApp(<App />);

    const workflowsLink = screen.getByRole('link', { name: /Workflows/i });
    await userEvent.click(workflowsLink);

    await waitFor(() => {
      expect(workflowsLink).toHaveClass('bg-primary-800');
    });
  });

  it('renders gradient background', () => {
    const { container } = renderApp(<App />);

    const mainDiv = container.querySelector('.min-h-screen');
    expect(mainDiv).toHaveClass('bg-gradient-to-br');
  });

  it('renders with proper layout structure', () => {
    const { container } = renderApp(<App />);

    expect(container.querySelector('nav')).toBeInTheDocument();
    expect(container.querySelector('main')).toBeInTheDocument();
  });

  it('displays logo icon', () => {
    renderApp(<App />);

    const header = screen.getByRole('banner');
    expect(header).toBeInTheDocument();
  });

  it('maintains responsive container width', () => {
    const { container } = renderApp(<App />);

    const mainContainer = container.querySelector('.max-w-7xl');
    expect(mainContainer).toBeInTheDocument();
  });
});
