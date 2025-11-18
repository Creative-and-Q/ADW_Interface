/**
 * DashboardWidget Container Component
 * Wraps module-provided dashboard widgets
 */

import React, { Suspense, ComponentType } from 'react';
import { loadModuleComponent } from '../utils/module-loader';

interface DashboardWidgetProps {
  module: string;
  widgetId: string;
  componentName: string;
  componentPath?: string;
  title?: string;
  width?: 'full' | 'half' | 'third';
}

export default function DashboardWidget({
  module,
  widgetId,
  componentName,
  componentPath,
  title,
  width = 'full',
}: DashboardWidgetProps) {
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

  const widthClasses = {
    full: 'col-span-12',
    half: 'col-span-12 md:col-span-6',
    third: 'col-span-12 md:col-span-4',
  };

  if (loading) {
    return (
      <div className={`card ${widthClasses[width]}`}>
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`card ${widthClasses[width]}`}>
        <h3 className="text-lg font-semibold text-red-600 mb-2">
          {title || 'Widget Error'}
        </h3>
        <p className="text-sm text-gray-600">
          Failed to load widget <code>{widgetId}</code> from module <code>{module}</code>
        </p>
        <p className="text-xs text-gray-500 mt-2">{error.message}</p>
      </div>
    );
  }

  if (!Component) {
    return (
      <div className={`card ${widthClasses[width]}`}>
        <h3 className="text-lg font-semibold text-yellow-600 mb-2">
          {title || 'Widget Not Found'}
        </h3>
        <p className="text-sm text-gray-600">
          Widget component <code>{componentName}</code> not found
        </p>
      </div>
    );
  }

  return (
    <div className={widthClasses[width]}>
      <div className="card">
        {title && (
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        )}
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          }
        >
          <Component />
        </Suspense>
      </div>
    </div>
  );
}

