/**
 * Module Component Loader
 * Handles loading React components from modules
 */

import React from 'react';

/**
 * Component loading strategy
 */
export type ComponentLoadStrategy = 'bundled' | 'remote' | 'dynamic';

/**
 * Module component metadata
 */
export interface ModuleComponent {
  module: string;
  componentName: string;
  componentPath: string;
  loadStrategy: ComponentLoadStrategy;
}

/**
 * Component registry for bundled components
 * Maps component names to actual React components
 */
const bundledComponents: Map<string, React.ComponentType<any>> = new Map();

/**
 * Register a bundled component
 */
export function registerBundledComponent(name: string, component: React.ComponentType<any>): void {
  bundledComponents.set(name, component);
}

// Use import.meta.glob to pre-generate all module component imports at build time
// This allows Vite to analyze and bundle all possible module components
const moduleComponents = import.meta.glob<{ default: React.ComponentType<any> }>(
  '@modules/*/frontend/src/pages/*.tsx'
);

// Also include local pages as fallback (this includes integrated module pages)
const localPages = import.meta.glob<{ default: React.ComponentType<any> }>(
  '../pages/*.tsx'
);

// Include local components (for module components that have been integrated)
const localComponents = import.meta.glob<{ default: React.ComponentType<any> }>(
  '../components/*.tsx'
);

/**
 * Load a module component
 */
export async function loadModuleComponent(
  module: string,
  componentName: string,
  componentPath?: string
): Promise<React.ComponentType<any> | null> {
  // First, try bundled components (for built-in modules)
  if (bundledComponents.has(componentName)) {
    return bundledComponents.get(componentName)!;
  }

  // Try to load from module's frontend directory using pre-generated glob imports
  const modulePath = `@modules/${module}/frontend/src/pages/${componentName}.tsx`;

  // Also try alternative path formats that the glob might match
  const possiblePaths = [
    modulePath,
    `../../modules/${module}/frontend/src/pages/${componentName}.tsx`,
    `/home/kevin/Home/ex_nihilo/modules/${module}/frontend/src/pages/${componentName}.tsx`,
  ];

  // Find matching import from the glob
  for (const [path, importFn] of Object.entries(moduleComponents)) {
    // Check if this path matches our target module and component
    if (path.includes(`/${module}/`) && path.endsWith(`/${componentName}.tsx`)) {
      try {
        const mod = await importFn();
        return mod.default || (mod as any)[componentName];
      } catch (error) {
        console.warn(`Failed to load component ${componentName} from ${path}:`, error);
      }
    }
  }

  // Fallback: try to import from local pages directory
  for (const [path, importFn] of Object.entries(localPages)) {
    if (path.endsWith(`/${componentName}.tsx`)) {
      try {
        const mod = await importFn();
        return mod.default || (mod as any)[componentName];
      } catch (err) {
        console.warn(`Failed to load component ${componentName} from local pages:`, err);
      }
    }
  }

  // Also try local components directory
  for (const [path, importFn] of Object.entries(localComponents)) {
    if (path.endsWith(`/${componentName}.tsx`)) {
      try {
        const mod = await importFn();
        return mod.default || (mod as any)[componentName];
      } catch (err) {
        console.warn(`Failed to load component ${componentName} from local components:`, err);
      }
    }
  }

  console.error(`Failed to load component ${componentName} from module ${module}`);
  return null;
}

/**
 * Lazy load a module component (for React.lazy)
 */
export function lazyLoadModuleComponent(
  module: string,
  componentName: string,
  componentPath?: string
): React.LazyExoticComponent<React.ComponentType<any>> {
  return React.lazy(() =>
    loadModuleComponent(module, componentName, componentPath).then((component) => {
      if (!component) {
        throw new Error(`Component ${componentName} not found`);
      }
      return { default: component };
    })
  );
}
