/**
 * Module Component Loader
 * Handles loading React components from modules
 */

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

  // Try to load from module's frontend directory
  try {
    // Construct path to module's frontend pages directory
    // Module name should match directory name (e.g., WorkflowOrchestrator -> modules/WorkflowOrchestrator)
    const modulePath = `../../modules/${module}/frontend/pages/${componentName}.tsx`;
    const component = await import(modulePath);
    return component.default || component[componentName];
  } catch (error) {
    // If module path fails, try componentPath if provided
    if (componentPath) {
      try {
        const component = await import(`../pages/${componentName}.tsx`);
        return component.default || component[componentName];
      } catch (err) {
        console.warn(`Failed to load component ${componentName} from ${componentPath}:`, err);
      }
    }
    
    // Fallback: try to import from pages directory (for backward compatibility)
    try {
      const component = await import(`../pages/${componentName}.tsx`);
      return component.default || component[componentName];
    } catch (err) {
      console.error(`Failed to load component ${componentName} from module ${module}:`, error);
      return null;
    }
  }
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

import React from 'react';
