/**
 * ModulePage Wrapper Component
 * Embeds module frontend pages as iframes
 */

import React from 'react';
import { useLocation } from 'react-router-dom';

interface ModulePageProps {
  module: string;
  componentName: string;
}

// Module frontend port mapping
const MODULE_PORTS: Record<string, number> = {
  'AIController': 5174,
  'WorkflowOrchestrator': 5175,
};

export default function ModulePage({ module }: ModulePageProps) {
  const location = useLocation();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const port = MODULE_PORTS[module];

  if (!port) {
    return (
      <div className="card p-6">
        <h2 className="text-xl font-bold text-yellow-600 mb-2">Module Not Configured</h2>
        <p className="text-gray-600">
          Module <code>{module}</code> does not have a frontend port configured.
        </p>
      </div>
    );
  }

  const iframeUrl = `http://localhost:${port}${location.pathname}${location.search}`;

  const handleLoad = () => {
    setLoading(false);
    setError(null);
  };

  const handleError = () => {
    setLoading(false);
    setError(`Failed to load module frontend. Make sure the ${module} frontend is running on port ${port}.`);
  };

  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading {module}...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="card p-6">
          <h2 className="text-xl font-bold text-red-600 mb-2">Failed to Load Module</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500">
            Try running: <code className="bg-gray-100 px-2 py-1 rounded">cd modules/{module}/frontend && npm run dev</code>
          </p>
        </div>
      )}

      {!error && (
        <iframe
          src={iframeUrl}
          className="w-full h-screen border-0"
          title={`${module} Frontend`}
          onLoad={handleLoad}
          onError={handleError}
          style={{ minHeight: 'calc(100vh - 4rem)' }}
        />
      )}
    </div>
  );
}

