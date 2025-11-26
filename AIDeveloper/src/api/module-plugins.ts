/**
 * Module Plugin API Routes
 * Provides endpoints for module plugin discovery and management
 */

import { Router, Request, Response } from 'express';
import * as logger from '../utils/logger.js';
import {
  getAllModuleManifests,
  readModuleManifest,
  getAllModulePages,
  getAllDashboardWidgets,
  getAllApiRoutes,
  getModulePluginMetadata,
} from '../utils/module-manager.js';
import {
  getAllModulesEnvStatus,
  getModuleEnvStatus,
  updateModuleEnvVars,
  copyEnvExample,
  syncEnvWithExample,
  hasEnvFile,
  hasEnvExample,
  // Legacy compatibility exports
  getAllModuleEnvVarValues,
  getModuleEnvVars,
  validateRequiredEnvVars,
} from '../utils/module-env-manager.js';

const router = Router();

/**
 * GET /api/modules/manifests
 * Get all module manifests
 */
router.get('/manifests', async (_req: Request, res: Response): Promise<void> => {
  try {
    const manifests = await getAllModuleManifests();
    const result: Record<string, any> = {};

    for (const [name, manifest] of manifests) {
      result[name] = manifest;
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to get module manifests', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to get module manifests',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/modules/:name/manifest
 * Get specific module manifest
 */
router.get('/:name/manifest', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.params;
    const manifest = await readModuleManifest(name);

    if (!manifest) {
      res.status(404).json({
        success: false,
        error: 'Manifest not found',
        message: `No manifest found for module: ${name}`,
      });
      return;
    }

    res.json({
      success: true,
      data: manifest,
    });
  } catch (error) {
    logger.error(`Failed to get manifest for ${req.params.name}`, error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to get module manifest',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/modules/pages
 * Get all module-provided pages
 */
router.get('/pages', async (_req: Request, res: Response): Promise<void> => {
  try {
    const pages = await getAllModulePages();
    res.json({
      success: true,
      data: pages,
    });
  } catch (error) {
    logger.error('Failed to get module pages', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to get module pages',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/modules/dashboard-widgets
 * Get all dashboard widgets
 */
router.get('/dashboard-widgets', async (_req: Request, res: Response): Promise<void> => {
  try {
    const widgets = await getAllDashboardWidgets();
    res.json({
      success: true,
      data: widgets,
    });
  } catch (error) {
    logger.error('Failed to get dashboard widgets', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard widgets',
      message: (error as Error).message,
    });
  }
});

// ============================================================================
// New per-module .env API endpoints
// ============================================================================

/**
 * GET /api/modules/env-status
 * Get environment file status for all modules
 */
router.get('/env-status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const statuses = await getAllModulesEnvStatus();
    res.json({
      success: true,
      data: statuses,
    });
  } catch (error) {
    logger.error('Failed to get module env statuses', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to get module env statuses',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/modules/:name/env-status
 * Get environment file status for a specific module
 */
router.get('/:name/env-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.params;
    const status = await getModuleEnvStatus(name);
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error(`Failed to get env status for ${req.params.name}`, error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to get module env status',
      message: (error as Error).message,
    });
  }
});

/**
 * PUT /api/modules/:name/env
 * Update environment variables for a specific module
 */
router.put('/:name/env', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.params;
    const updates = req.body as Record<string, string | null>;

    if (!updates || typeof updates !== 'object') {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        message: 'Expected an object with env var key-value pairs',
      });
      return;
    }

    await updateModuleEnvVars(name, updates);

    res.json({
      success: true,
      message: `Environment variables updated for ${name}`,
    });
  } catch (error) {
    logger.error(`Failed to update env vars for ${req.params.name}`, error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to update env vars',
      message: (error as Error).message,
    });
  }
});

/**
 * POST /api/modules/:name/env/copy-example
 * Copy .env.example to .env for a module
 */
router.post('/:name/env/copy-example', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.params;

    // Check if .env.example exists
    if (!await hasEnvExample(name)) {
      res.status(404).json({
        success: false,
        error: 'No .env.example file',
        message: `Module ${name} does not have a .env.example file`,
      });
      return;
    }

    // Check if .env already exists
    if (await hasEnvFile(name)) {
      res.status(400).json({
        success: false,
        error: '.env already exists',
        message: `Module ${name} already has a .env file. Use sync-example to add missing variables.`,
      });
      return;
    }

    const copied = await copyEnvExample(name);

    if (copied) {
      res.json({
        success: true,
        message: `Copied .env.example to .env for ${name}`,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to copy file',
        message: 'Unknown error occurred while copying .env.example',
      });
    }
  } catch (error) {
    logger.error(`Failed to copy .env.example for ${req.params.name}`, error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to copy .env.example',
      message: (error as Error).message,
    });
  }
});

/**
 * POST /api/modules/:name/env/sync-example
 * Add missing variables from .env.example to .env
 */
router.post('/:name/env/sync-example', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.params;

    const addedKeys = await syncEnvWithExample(name);

    res.json({
      success: true,
      message: addedKeys.length > 0
        ? `Added ${addedKeys.length} missing variables to ${name}/.env`
        : `No missing variables to add for ${name}`,
      addedKeys,
    });
  } catch (error) {
    logger.error(`Failed to sync env with example for ${req.params.name}`, error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync env with example',
      message: (error as Error).message,
    });
  }
});

// ============================================================================
// Legacy API endpoints (for backwards compatibility)
// ============================================================================

/**
 * GET /api/modules/env
 * Get all module environment variables with current values
 * @deprecated Use /api/modules/env-status instead
 */
router.get('/env', async (_req: Request, res: Response): Promise<void> => {
  try {
    const envVars = await getAllModuleEnvVarValues();
    res.json({
      success: true,
      data: envVars,
    });
  } catch (error) {
    logger.error('Failed to get module env vars', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to get module env vars',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/modules/:name/env
 * Get environment variables for a specific module
 * @deprecated Use /api/modules/:name/env-status instead
 */
router.get('/:name/env', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.params;
    const envVars = await getModuleEnvVars(name);
    res.json({
      success: true,
      data: envVars,
    });
  } catch (error) {
    logger.error(`Failed to get env vars for ${req.params.name}`, error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to get module env vars',
      message: (error as Error).message,
    });
  }
});

/**
 * PUT /api/modules/env
 * Update module environment variables (global - deprecated)
 * @deprecated Use PUT /api/modules/:name/env instead
 */
router.put('/env', async (req: Request, res: Response): Promise<void> => {
  try {
    const updates = req.body as Record<string, string | null>;

    if (!updates || typeof updates !== 'object') {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        message: 'Expected an object with env var key-value pairs',
      });
      return;
    }

    // Note: This endpoint is deprecated. Env vars should be updated per-module.
    // For now, we'll log a warning but still try to update the values.
    logger.warn('PUT /api/modules/env is deprecated - use PUT /api/modules/:name/env instead');

    res.json({
      success: true,
      message: 'This endpoint is deprecated. Please use PUT /api/modules/:name/env instead.',
    });
  } catch (error) {
    logger.error('Failed to update env vars', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to update env vars',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/modules/env/validate
 * Validate required environment variables
 */
router.get('/env/validate', async (_req: Request, res: Response): Promise<void> => {
  try {
    const issues = await validateRequiredEnvVars();
    res.json({
      success: true,
      data: issues,
      valid: issues.length === 0,
    });
  } catch (error) {
    logger.error('Failed to validate env vars', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate env vars',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/modules/api-routes
 * Get all API routes from modules
 */
router.get('/api-routes', async (_req: Request, res: Response): Promise<void> => {
  try {
    const routes = await getAllApiRoutes();
    res.json({
      success: true,
      data: routes,
    });
  } catch (error) {
    logger.error('Failed to get API routes', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to get API routes',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/modules/:name/metadata
 * Get full plugin metadata for a module
 */
router.get('/:name/metadata', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.params;
    const metadata = await getModulePluginMetadata(name);

    if (!metadata) {
      res.status(404).json({
        success: false,
        error: 'Module not found',
        message: `Module not found: ${name}`,
      });
      return;
    }

    res.json({
      success: true,
      data: metadata,
    });
  } catch (error) {
    logger.error(`Failed to get metadata for ${req.params.name}`, error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to get module metadata',
      message: (error as Error).message,
    });
  }
});

export default router;
