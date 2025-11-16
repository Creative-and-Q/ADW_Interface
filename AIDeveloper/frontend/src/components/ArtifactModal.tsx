import { X, FileText, Calendar, User, Hash, Copy, Check } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import toast from 'react-hot-toast';

interface ArtifactModalProps {
  artifact: any;
  onClose: () => void;
}

export default function ArtifactModal({ artifact, onClose }: ArtifactModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content || '');
      setCopied(true);
      toast.success('Content copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy content');
    }
  };

  const getArtifactColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'code':
        return { bg: 'bg-blue-50', text: 'text-blue-900', border: 'border-blue-200', accent: 'bg-blue-600' };
      case 'plan':
        return { bg: 'bg-purple-50', text: 'text-purple-900', border: 'border-purple-200', accent: 'bg-purple-600' };
      case 'documentation':
        return { bg: 'bg-green-50', text: 'text-green-900', border: 'border-green-200', accent: 'bg-green-600' };
      case 'test':
        return { bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-200', accent: 'bg-amber-600' };
      default:
        return { bg: 'bg-gray-50', text: 'text-gray-900', border: 'border-gray-200', accent: 'bg-gray-600' };
    }
  };

  const colors = getArtifactColor(artifact.artifact_type);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className={`${colors.bg} ${colors.border} border-b p-6`}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <FileText className={`h-6 w-6 ${colors.text}`} />
                <h2 className={`text-2xl font-bold ${colors.text} capitalize`}>
                  {artifact.artifact_type}
                </h2>
              </div>
              {artifact.file_path && (
                <p className={`text-sm font-mono ${colors.text} opacity-75`}>
                  {artifact.file_path}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className={`${colors.text} hover:opacity-75 transition-opacity p-2 rounded-lg hover:bg-white hover:bg-opacity-50`}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Metadata */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span className="text-gray-600">Created:</span>
              <span className="font-medium text-gray-900">
                {format(parseISO(artifact.created_at), 'MMM d, yyyy HH:mm:ss')}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <Hash className="h-4 w-4 text-gray-500" />
              <span className="text-gray-600">Artifact ID:</span>
              <span className="font-medium text-gray-900">{artifact.id}</span>
            </div>
            {artifact.agent_execution_id && (
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-gray-500" />
                <span className="text-gray-600">Agent Execution:</span>
                <span className="font-medium text-gray-900">{artifact.agent_execution_id}</span>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">Content</h3>
            <button
              onClick={handleCopy}
              className="flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-600" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          {artifact.content ? (
            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-gray-100 font-mono whitespace-pre-wrap leading-relaxed">
                {artifact.content}
              </pre>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <FileText className="h-12 w-12 mb-3 text-gray-400" />
              <p>No content available</p>
            </div>
          )}

          {/* Metadata JSON */}
          {artifact.metadata && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Metadata</h3>
              <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto border border-gray-200">
                <pre className="text-sm text-gray-800 font-mono whitespace-pre-wrap">
                  {typeof artifact.metadata === 'string'
                    ? artifact.metadata
                    : JSON.stringify(artifact.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {artifact.content && (
                <span>
                  {artifact.content.split('\n').length} lines • {artifact.content.length} characters
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-700 rounded-md hover:bg-gray-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
