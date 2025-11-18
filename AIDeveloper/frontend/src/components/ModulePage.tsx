/**
 * ModulePage Wrapper Component
 * Wraps module-provided pages with consistent layout and error handling
 */

import React, { Suspense, ComponentType } from 'react';
import { loadModuleComponent } from '../utils/module-loader';

interface ModulePageProps {
  module: string;
  componentName: string;
  componentPath?: string;
}

export default function ModulePage({ module, componentName, componentPath }: ModulePageProps) {
  const [Component, setComponent] = React.useState<ComponentType<any> | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadModuleComponent(module, componentName, componentPath)
      .then((comp) => {
        setComponent(() => comp);
        setLoading(false);
      })
      .catch((err) => {
        setError(err);
        setLoading(false);
      });
  }, [module, componentName, componentPath]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6">
        <h2 className="text-xl font-bold text-red-600 mb-2">Failed to Load Module Page</h2>
        <p className="text-gray-600 mb-4">
          Failed to load component <code>{componentName}</code> from module <code>{module}</code>
        </p>
        <p className="text-sm text-gray-500">{error.message}</p>
      </div>
    );
  }

  if (!Component) {
    return (
      <div className="card p-6">
        <h2 className="text-xl font-bold text-yellow-600 mb-2">Component Not Found</h2>
        <p className="text-gray-600">
          Component <code>{componentName}</code> not found in module <code>{module}</code>
        </p>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      }
    >
      <Component />
    </Suspense>
  );
}

