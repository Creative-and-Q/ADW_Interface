import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithRouter, screen, waitFor } from '../test/utils';
import userEvent from '@testing-library/user-event';
import Prompts from './Prompts';
import { promptsAPI } from '../services/api';
import { mockPrompts, mockPromptContent } from '../test/mockData';

vi.mock('../services/api', () => ({
  promptsAPI: {
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
  },
}));

describe('Prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.mocked(promptsAPI.list).mockImplementation(
      () => new Promise(() => {})
    );

    renderWithRouter(<Prompts />);

    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
  });

  it('loads and displays prompt list', async () => {
    vi.mocked(promptsAPI.list).mockResolvedValue({
      data: { prompts: mockPrompts },
    });
    vi.mocked(promptsAPI.get).mockResolvedValue({ data: mockPromptContent });

    renderWithRouter(<Prompts />);

    await waitFor(() => {
      expect(screen.getByText('AI Prompts')).toBeInTheDocument();
    });

    expect(screen.getByText('plan')).toBeInTheDocument();
    expect(screen.getByText('code')).toBeInTheDocument();
    expect(screen.getByText('test')).toBeInTheDocument();
  });

  it('automatically selects first prompt', async () => {
    vi.mocked(promptsAPI.list).mockResolvedValue({
      data: { prompts: mockPrompts },
    });
    vi.mocked(promptsAPI.get).mockResolvedValue({ data: mockPromptContent });

    renderWithRouter(<Prompts />);

    await waitFor(() => {
      expect(promptsAPI.get).toHaveBeenCalledWith('plan-agent');
    });

    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
  });

  it('loads prompt content when selected', async () => {
    vi.mocked(promptsAPI.list).mockResolvedValue({
      data: { prompts: mockPrompts },
    });
    vi.mocked(promptsAPI.get).mockResolvedValue({ data: mockPromptContent });

    renderWithRouter(<Prompts />);

    await waitFor(() => {
      expect(screen.getByText('plan')).toBeInTheDocument();
    });

    const codeButton = screen.getByText('code').closest('button')!;
    await userEvent.click(codeButton);

    await waitFor(() => {
      expect(promptsAPI.get).toHaveBeenCalledWith('code-agent');
    });
  });

  it('enables save button when content changes', async () => {
    vi.mocked(promptsAPI.list).mockResolvedValue({
      data: { prompts: mockPrompts },
    });
    vi.mocked(promptsAPI.get).mockResolvedValue({ data: mockPromptContent });

    renderWithRouter(<Prompts />);

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    expect(saveButton).toBeDisabled();

    const editor = screen.getByTestId('monaco-editor');
    await userEvent.clear(editor);
    await userEvent.type(editor, 'Updated content');

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
  });

  it('saves prompt changes', async () => {
    vi.mocked(promptsAPI.list).mockResolvedValue({
      data: { prompts: mockPrompts },
    });
    vi.mocked(promptsAPI.get).mockResolvedValue({ data: mockPromptContent });
    vi.mocked(promptsAPI.update).mockResolvedValue({ data: { success: true } });

    renderWithRouter(<Prompts />);

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });

    const editor = screen.getByTestId('monaco-editor');
    await userEvent.clear(editor);
    await userEvent.type(editor, 'Updated content');

    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(promptsAPI.update).toHaveBeenCalledWith(
        'plan-agent',
        'Updated content'
      );
    });

    expect(screen.getByText('Saved!')).toBeInTheDocument();
  });

  it('shows unsaved changes indicator', async () => {
    vi.mocked(promptsAPI.list).mockResolvedValue({
      data: { prompts: mockPrompts },
    });
    vi.mocked(promptsAPI.get).mockResolvedValue({ data: mockPromptContent });

    renderWithRouter(<Prompts />);

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });

    expect(screen.getByText('No changes')).toBeInTheDocument();

    const editor = screen.getByTestId('monaco-editor');
    await userEvent.clear(editor);
    await userEvent.type(editor, 'New text');

    await waitFor(() => {
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    });
  });

  it('displays prompt file sizes', async () => {
    vi.mocked(promptsAPI.list).mockResolvedValue({
      data: { prompts: mockPrompts },
    });
    vi.mocked(promptsAPI.get).mockResolvedValue({ data: mockPromptContent });

    renderWithRouter(<Prompts />);

    await waitFor(() => {
      expect(screen.getByText('1024 bytes')).toBeInTheDocument();
    });

    expect(screen.getByText('2048 bytes')).toBeInTheDocument();
    expect(screen.getByText('1536 bytes')).toBeInTheDocument();
  });

  it('shows empty state when no prompt selected', async () => {
    vi.mocked(promptsAPI.list).mockResolvedValue({
      data: { prompts: [] },
    });

    renderWithRouter(<Prompts />);

    await waitFor(() => {
      expect(screen.getByText('Select a prompt to edit')).toBeInTheDocument();
    });
  });

  it('displays info banner about prompts', async () => {
    vi.mocked(promptsAPI.list).mockResolvedValue({
      data: { prompts: mockPrompts },
    });
    vi.mocked(promptsAPI.get).mockResolvedValue({ data: mockPromptContent });

    renderWithRouter(<Prompts />);

    await waitFor(() => {
      expect(screen.getByText('About AI Prompts')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/These prompts define the system instructions/)
    ).toBeInTheDocument();
  });

  it('handles save errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(promptsAPI.list).mockResolvedValue({
      data: { prompts: mockPrompts },
    });
    vi.mocked(promptsAPI.get).mockResolvedValue({ data: mockPromptContent });
    vi.mocked(promptsAPI.update).mockRejectedValue(new Error('Save failed'));

    renderWithRouter(<Prompts />);

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });

    const editor = screen.getByTestId('monaco-editor');
    await userEvent.clear(editor);
    await userEvent.type(editor, 'New content');

    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to save prompt')).toBeInTheDocument();
    });

    consoleError.mockRestore();
  });

  it('highlights selected prompt', async () => {
    vi.mocked(promptsAPI.list).mockResolvedValue({
      data: { prompts: mockPrompts },
    });
    vi.mocked(promptsAPI.get).mockResolvedValue({ data: mockPromptContent });

    renderWithRouter(<Prompts />);

    await waitFor(() => {
      expect(screen.getByText('plan')).toBeInTheDocument();
    });

    const planButton = screen.getByText('plan').closest('button')!;
    expect(planButton).toHaveClass('border-primary-500');
  });

  it('handles API errors when loading prompts', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(promptsAPI.list).mockRejectedValue(new Error('API Error'));

    renderWithRouter(<Prompts />);

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to load prompts:',
        expect.any(Error)
      );
    });

    consoleError.mockRestore();
  });
});
