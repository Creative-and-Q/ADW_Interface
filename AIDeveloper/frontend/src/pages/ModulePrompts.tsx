import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { modulesAPI } from '../services/api';
import { ArrowLeft, FileText, Save, AlertCircle, CheckCircle } from 'lucide-react';
import Editor from '@monaco-editor/react';

interface Prompt {
  name: string;
  path: string;
}

export default function ModulePrompts() {
  const { moduleName } = useParams();
  const navigate = useNavigate();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [promptContent, setPromptContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (moduleName) {
      loadPrompts();
    }
  }, [moduleName]);

  const loadPrompts = async () => {
    try {
      const { data } = await modulesAPI.getPrompts(moduleName!);
      setPrompts(data.prompts);
      if (data.prompts.length > 0) {
        loadPromptContent(data.prompts[0].name);
      }
    } catch (error) {
      console.error('Failed to load prompts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPromptContent = async (promptName: string) => {
    try {
      const { data } = await modulesAPI.getPromptContent(moduleName!, promptName);
      setPromptContent(data.content);
      setOriginalContent(data.content);
      setSelectedPrompt(promptName);
      setSaveStatus('idle');
    } catch (error) {
      console.error('Failed to load prompt content:', error);
    }
  };

  const handleSave = async () => {
    if (!selectedPrompt) return;

    setSaving(true);
    setSaveStatus('idle');

    try {
      await modulesAPI.updatePrompt(moduleName!, selectedPrompt, promptContent);
      setOriginalContent(promptContent);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Failed to save prompt:', error);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const hasUnsavedChanges = promptContent !== originalContent;

  const formatPromptName = (filename: string): string => {
    return filename
      .replace('.md', '')
      .replace('-prompt', '')
      .replace('-agent', '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (loading) {
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
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/modules')}
            className="btn btn-secondary flex items-center"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Modules
          </button>
          <div>
            <h2 className="text-3xl font-bold text-gray-900">
              {moduleName} Prompts
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Edit AI prompts for this module
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {saveStatus === 'success' && (
            <div className="flex items-center space-x-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Saved</span>
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="flex items-center space-x-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Save failed</span>
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={!hasUnsavedChanges || saving}
            className={`btn flex items-center ${
              hasUnsavedChanges && !saving
                ? 'btn-primary'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {prompts.length === 0 ? (
        <div className="card text-center py-12">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Prompts Found
          </h3>
          <p className="text-gray-500">
            This module doesn't have any AI prompts configured.
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Create prompts in <code className="bg-gray-100 px-2 py-1 rounded">config/prompts/</code>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Prompt List */}
          <div className="lg:col-span-1">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Available Prompts
              </h3>
              <div className="space-y-2">
                {prompts.map((prompt) => (
                  <button
                    key={prompt.name}
                    onClick={() => loadPromptContent(prompt.name)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                      selectedPrompt === prompt.name
                        ? 'bg-primary-100 text-primary-700 font-medium'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <FileText className="h-4 w-4" />
                      <span className="text-sm">{formatPromptName(prompt.name)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Editor */}
          <div className="lg:col-span-3">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedPrompt ? formatPromptName(selectedPrompt) : 'Select a prompt'}
                </h3>
                {hasUnsavedChanges && (
                  <span className="text-sm text-yellow-600 font-medium">
                    Unsaved changes
                  </span>
                )}
              </div>

              {selectedPrompt ? (
                <div className="border rounded-lg overflow-hidden">
                  <Editor
                    height="600px"
                    defaultLanguage="markdown"
                    value={promptContent}
                    onChange={(value) => setPromptContent(value || '')}
                    theme="vs-light"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      lineNumbers: 'on',
                      wordWrap: 'on',
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                    }}
                  />
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  Select a prompt from the list to edit
                </div>
              )}

              {selectedPrompt && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">
                    About This Prompt
                  </h4>
                  <p className="text-sm text-blue-700">
                    This prompt file is used by the {moduleName} module to guide AI behavior.
                    Changes will take effect on the next agent execution.
                  </p>
                  <p className="text-xs text-blue-600 mt-2">
                    File: <code className="bg-blue-100 px-1 rounded">{selectedPrompt}</code>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
