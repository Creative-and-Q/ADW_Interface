/**
 * ScreenshotTools Module
 * Provides screenshot capture and image processing for AI agents
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

export interface ScreenshotOptions {
  url?: string;
  selector?: string;
  fullPage?: boolean;
  width?: number;
  height?: number;
  waitForSelector?: string;
  waitTime?: number;
  outputPath?: string;
}

export interface ScreenshotResult {
  success: boolean;
  base64?: string;
  filePath?: string;
  mimeType: string;
  width?: number;
  height?: number;
  error?: string;
}

/**
 * Screenshot manager for taking and processing screenshots
 */
export class ScreenshotManager {
  private browser: Browser | null = null;

  /**
   * Initialize the browser instance
   */
  async init(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
    }
  }

  /**
   * Close the browser instance
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Take a screenshot of a URL
   */
  async captureUrl(options: ScreenshotOptions): Promise<ScreenshotResult> {
    if (!options.url) {
      return { success: false, mimeType: 'image/png', error: 'URL is required' };
    }

    try {
      await this.init();
      const page = await this.browser!.newPage();

      await page.setViewport({
        width: options.width || 1920,
        height: options.height || 1080,
      });

      await page.goto(options.url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
      }

      if (options.waitTime) {
        await new Promise(resolve => setTimeout(resolve, options.waitTime));
      }

      let screenshotBuffer: Buffer;
      if (options.selector) {
        const element = await page.$(options.selector);
        if (!element) {
          await page.close();
          return { success: false, mimeType: 'image/png', error: `Selector not found: ${options.selector}` };
        }
        screenshotBuffer = await element.screenshot({ type: 'png' }) as Buffer;
      } else {
        screenshotBuffer = await page.screenshot({
          type: 'png',
          fullPage: options.fullPage || false,
        }) as Buffer;
      }

      await page.close();

      if (options.outputPath) {
        await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
        await fs.writeFile(options.outputPath, screenshotBuffer);
      }

      return {
        success: true,
        base64: screenshotBuffer.toString('base64'),
        filePath: options.outputPath,
        mimeType: 'image/png',
      };
    } catch (error) {
      return {
        success: false,
        mimeType: 'image/png',
        error: `Screenshot failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Read an existing image file and encode as base64
   */
  async readImage(imagePath: string): Promise<ScreenshotResult> {
    try {
      const buffer = await fs.readFile(imagePath);
      const ext = path.extname(imagePath).toLowerCase();

      let mimeType = 'image/png';
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.webp') mimeType = 'image/webp';

      return {
        success: true,
        base64: buffer.toString('base64'),
        filePath: imagePath,
        mimeType,
      };
    } catch (error) {
      return {
        success: false,
        mimeType: 'image/png',
        error: `Failed to read image: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Take a screenshot using system command (fallback for desktop)
   */
  async captureScreen(outputPath: string): Promise<ScreenshotResult> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const tools = [
        `scrot "${outputPath}"`,
        `gnome-screenshot -f "${outputPath}"`,
        `import -window root "${outputPath}"`,
      ];

      for (const tool of tools) {
        try {
          await execAsync(tool, { timeout: 10000 });
          const buffer = await fs.readFile(outputPath);
          return {
            success: true,
            base64: buffer.toString('base64'),
            filePath: outputPath,
            mimeType: 'image/png',
          };
        } catch {
          continue;
        }
      }

      return {
        success: false,
        mimeType: 'image/png',
        error: 'No screenshot tool available',
      };
    } catch (error) {
      return {
        success: false,
        mimeType: 'image/png',
        error: `Screen capture failed: ${(error as Error).message}`,
      };
    }
  }
}

/**
 * Format image for Claude/OpenRouter vision API (multimodal content)
 */
export function formatImageForVision(result: ScreenshotResult): {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
} | null {
  if (!result.success || !result.base64) {
    return null;
  }

  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: result.mimeType,
      data: result.base64,
    },
  };
}

/**
 * Create screenshot artifact for workflow output
 */
export function createScreenshotArtifact(
  result: ScreenshotResult,
  description: string,
  metadata?: Record<string, any>
): {
  type: string;
  content: string;
  filePath?: string;
  metadata?: Record<string, any>;
} {
  return {
    type: 'screenshot',
    content: result.base64 || '',
    filePath: result.filePath,
    metadata: {
      mimeType: result.mimeType,
      description,
      capturedAt: new Date().toISOString(),
      ...metadata,
    },
  };
}

export default ScreenshotManager;
