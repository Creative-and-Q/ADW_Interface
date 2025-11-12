import { useEffect, useState } from 'react';
import { promptsAPI } from '../services/api';
import { Save, FileText, AlertCircle, Check } from 'lucide-react';
import Editor from '@monaco-editor/react';

// Helper function to format prompt display name
const formatPromptName = (filename: string): string => {
  return filename
    .replace('.md', '')
    .replace('-prompt', '')
    .replace('-agent', '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export default function Prompts() {
  const [prompts, setPrompts] = useState<any[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [promptContent, setPromptContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    loadPrompts();
  }, []);

  const loadPrompts = async () => {
    try {
      const { data } = await promptsAPI.list();
      setPrompts(data.prompts);
      if (data.prompts.length > 0 && !selectedPrompt) {
        selectPrompt(data.prompts[0].name);
      }
    } catch (error) {
      console.error('Failed to load prompts:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectPrompt = async (name: string) => {
    try {
      setLoading(true);
      const { data } = await promptsAPI.get(name);
      setSelectedPrompt(name);
      setPromptContent(data.content);
      setOriginalContent(data.content);
      setSaveSuccess(false);
      setSaveError(null);
    } catch (error) {
      console.error('Failed to load prompt content:', error);
      setSaveError('Failed to load prompt content');
    } finally {
      setLoading(false);
    }
  };

  const savePrompt = async () => {
    if (!selectedPrompt) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      await promptsAPI.update(selectedPrompt, promptContent);
      setOriginalContent(promptContent);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save prompt:', error);
      setSaveError('Failed to save prompt');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = promptContent !== originalContent;

  if (loading && prompts.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 sm:px-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">AI Prompts</h2>
          <p className="mt-1 text-sm text-gray-500">
            View and edit agent system prompts
          </p>
        </div>
        {selectedPrompt && (
          <button
            onClick={savePrompt}
            disabled={!hasChanges || saving}
            className={`btn flex items-center ${
              hasChanges
                ? 'btn-primary'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : saveSuccess ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Saved!
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </button>
        )}
      </div>

      {/* Error Message */}
      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
          <AlertCircle className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-red-900">Error</h4>
            <p className="text-sm text-red-700 mt-1">{saveError}</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Prompts List */}
        <div className="lg:col-span-1">
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Available Prompts
            </h3>
            <div className="space-y-2">
              {prompts.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">
                  No prompts found
                </p>
              ) : (
                prompts.map((prompt) => (
                  <button
                    key={prompt.name}
                    onClick={() => selectPrompt(prompt.name)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors flex items-start space-x-3 ${
                      selectedPrompt === prompt.name
                        ? 'bg-primary-50 border-2 border-primary-500'
                        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                    }`}
                  >
                    <FileText
                      className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                        selectedPrompt === prompt.name
                          ? 'text-primary-600'
                          : 'text-gray-400'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-medium ${
                          selectedPrompt === prompt.name
                            ? 'text-primary-900'
                            : 'text-gray-900'
                        }`}
                      >
                        {formatPromptName(prompt.name)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {prompt.size} bytes • {prompt.lines || 0} lines
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Editor */}
        <div className="lg:col-span-3">
          {selectedPrompt ? (
            <div className="card p-0 overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {formatPromptName(selectedPrompt)}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {hasChanges ? (
                      <span className="text-warning font-medium">
                        Unsaved changes
                      </span>
                    ) : (
                      'No changes'
                    )}
                  </p>
                </div>
              </div>
              <div className="h-[600px]">
                <Editor
                  height="100%"
                  defaultLanguage="markdown"
                  value={promptContent}
                  onChange={(value) => setPromptContent(value || '')}
                  theme="vs-light"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    wrappingIndent: 'indent',
                    padding: { top: 16, bottom: 16 },
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="card flex items-center justify-center h-96">
              <div className="text-center text-gray-500">
                <FileText className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <p className="text-lg font-medium">Select a prompt to edit</p>
                <p className="text-sm mt-2">
                  Choose a prompt from the list to view and edit its content
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info Section */}
      <div className="card bg-blue-50 border-blue-200">
        <div className="flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-blue-900">
              About AI Prompts
            </h4>
            <p className="text-sm text-blue-700 mt-1">
              These prompts define the system instructions for each AI agent.
              Changes will affect how agents process tasks. Be careful when
              modifying prompts as they directly impact agent behavior and
              output quality.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
