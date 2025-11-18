/**
 * Module Plugin System Types
 * Defines interfaces for module manifests and plugin capabilities
 */

/**
 * Module manifest structure
 */
export interface ModuleManifest {
  name: string;
  version: string;
  description: string;

  // Module organization
  category?: string;     // e.g., "AI Agents", "Game Systems", "Controllers"
  project?: string;      // e.g., "Ex Nihilo", "AIDeveloper"
  tags?: string[];       // Additional searchable tags

  // Frontend pages this module provides
  pages?: ModulePage[];

  // Dashboard widgets
  dashboardWidgets?: DashboardWidget[];

  // Environment variables this module uses
  envVars?: EnvVarDefinition[];

  // API proxy routes (like current /aicontroller/*)
  apiRoutes?: ApiRoute[];
}

/**
 * Frontend page definition
 */
export interface ModulePage {
  path: string;           // e.g., "/chains"
  component: string;     // Path to React component or component name
  label: string;         // Navigation label
  icon?: string;         // Icon name (lucide-react icon)
  navOrder?: number;     // Order in navigation
  requiresAuth?: boolean; // Require authentication
}

/**
 * Dashboard widget definition
 */
export interface DashboardWidget {
  id: string;
  component: string;     // Path to React component or component name
  position: 'top' | 'middle' | 'bottom';
  width: 'full' | 'half' | 'third';
  order?: number;
  title?: string;        // Widget title
}

/**
 * Environment variable definition
 */
export interface EnvVarDefinition {
  key: string;
  description: string;
  required: boolean;
  defaultValue?: string;
  type?: 'string' | 'number' | 'boolean';
  secret?: boolean;      // Hide value in UI
  modulePrefix?: string; // Prefix for env var (e.g., "AICONTROLLER")
}

/**
 * API proxy route definition
 */
export interface ApiRoute {
  prefix: string;        // e.g., "/aicontroller"
  target: string;        // e.g., "http://localhost:3035"
  port?: number;        // Port number (alternative to full target URL)
}

/**
 * Module plugin metadata (extended from Module)
 */
export interface ModulePluginMetadata {
  name: string;
  path: string;
  manifest?: ModuleManifest;
  hasManifest: boolean;
  hasFrontend: boolean;
  frontendPath?: string;
}

