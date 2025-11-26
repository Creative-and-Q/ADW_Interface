/**
 * ModulePage Wrapper Component
 * Wraps module-provided pages with consistent layout and error handling
 * Uses the module-loader to dynamically load components
 */

import React, { useState, useEffect, Suspense } from 'react';
import { loadModuleComponent } from '../utils/module-loader';

interface ModulePageProps {
  module: string;
  componentName: string;
  componentPath?: string;
}

export default function ModulePage({ module, componentName, componentPath }: ModulePageProps) {
  const [Component, setComponent] = useState<React.ComponentType<any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    loadModuleComponent(module, componentName, componentPath)
      .then((comp) => {
        if (comp) {
          setComponent(() => comp);
        } else {
          setError(`Component ${componentName} not found in module ${module}`);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(`Failed to load component ${componentName} from ${module}:`, err);
        setError(err.message || `Failed to load component ${componentName}`);
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

  if (error || !Component) {
    return (
      <div className="card p-6">
        <h2 className="text-xl font-bold text-red-600 mb-2">Failed to Load Module Page</h2>
        <p className="text-gray-600 mb-4">
          {error || `Component ${componentName} not found in module ${module}`}
        </p>
        <p className="text-sm text-gray-500">
          Component: <code>{componentName}</code> | Module: <code>{module}</code>
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
