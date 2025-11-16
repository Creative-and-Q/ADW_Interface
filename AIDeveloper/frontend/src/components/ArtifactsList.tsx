import { useState } from 'react';
import { FileText, FileCode, File, CheckCircle, Eye } from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import ArtifactModal from './ArtifactModal';

interface ArtifactsListProps {
  artifacts: any[];
  className?: string;
}

export default function ArtifactsList({ artifacts, className = '' }: ArtifactsListProps) {
  const [selectedArtifact, setSelectedArtifact] = useState<any | null>(null);

  if (artifacts.length === 0) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Generated Artifacts</h3>
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <FileText className="h-12 w-12 mb-3 text-gray-400" />
          <p>No artifacts generated yet</p>
        </div>
      </div>
    );
  }

  const getArtifactIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'code':
        return FileCode;
      case 'plan':
      case 'documentation':
        return FileText;
      default:
        return File;
    }
  };

  const getArtifactColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'code':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'plan':
        return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'documentation':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'test':
        return 'text-amber-600 bg-amber-50 border-amber-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Generated Artifacts
        </h3>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
          <CheckCircle className="h-4 w-4 mr-1" />
          {artifacts.length} {artifacts.length === 1 ? 'artifact' : 'artifacts'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {artifacts.map((artifact) => {
          const Icon = getArtifactIcon(artifact.artifact_type);
          const colorClass = getArtifactColor(artifact.artifact_type);

          return (
            <button
              key={artifact.id}
              onClick={() => setSelectedArtifact(artifact)}
              className={clsx(
                'w-full border rounded-lg p-4 hover:shadow-lg transition-all duration-200 text-left group',
                'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
                colorClass
              )}
            >
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-sm capitalize">
                      {artifact.artifact_type}
                    </p>
                    <Eye className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {artifact.file_path && (
                    <p className="text-xs font-mono truncate opacity-75 mb-2">
                      {artifact.file_path}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs opacity-75">
                    <span>Created {formatDistanceToNow(parseISO(artifact.created_at), { addSuffix: true })}</span>
                    <time className="font-mono">
                      {format(parseISO(artifact.created_at), 'HH:mm:ss')}
                    </time>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Artifact Modal */}
      {selectedArtifact && (
        <ArtifactModal
          artifact={selectedArtifact}
          onClose={() => setSelectedArtifact(null)}
        />
      )}
    </div>
  );
}
