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
  componentName: string
): Promise<React.ComponentType<any> | null> {
  // First, try bundled components (for built-in modules)
  if (bundledComponents.has(componentName)) {
    return bundledComponents.get(componentName)!;
  }

  // If not found in bundled components, component not available
  console.error(`Component ${componentName} not found in module ${module}.`);
  console.error('Available bundled components:', Array.from(bundledComponents.keys()).join(', '));
  return null;
}

/**
 * Lazy load a module component (for React.lazy)
 */
export function lazyLoadModuleComponent(
  module: string,
  componentName: string
): React.LazyExoticComponent<React.ComponentType<any>> {
  return React.lazy(() =>
    loadModuleComponent(module, componentName).then((component) => {
      if (!component) {
        throw new Error(`Component ${componentName} not found`);
      }
      return { default: component };
    })
  );
}

import React from 'react';
