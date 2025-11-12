/**
 * Document Agent
 * Generates and updates documentation
 */

import { BaseAgent } from './base-agent.js';
import { AgentType, AgentInput, AgentOutput, ArtifactType } from '../types.js';
import { config } from '../config.js';
import * as logger from '../utils/logger.js';
import { getArtifacts } from '../workflow-state.js';
import { writeFile, readFile } from '../utils/file-system.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * Documentation result from AI
 */
interface DocumentationResult {
  success: boolean;
  documentation: Array<{
    type: 'code' | 'api' | 'readme' | 'changelog' | 'adr';
    file: string;
    content: string;
    description: string;
  }>;
  summary: string;
  coverage: {
    functions: number;
    classes: number;
    files: number;
  };
}

export class DocumentAgent extends BaseAgent {
  constructor() {
    super(AgentType.DOCUMENT, config.openrouter.models.docs);
  }

  /**
   * Execute document agent
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    try {
      logger.info('Document agent starting', { workflowId: input.workflowId });

      // Load artifacts for documentation
      const artifacts = await this.loadArtifactsForDocumentation(
        input.workflowId
      );

      // Load system prompt
      const systemPrompt = await this.loadSystemPrompt(
        'document-agent-prompt.md'
      );

      // Build documentation prompt
      const userPrompt = this.buildDocumentationPrompt(artifacts);

      // Call AI API
      logger.info('Calling AI for documentation generation');
      const aiResponse = await this.callOpenRouter(
        [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        {
          systemPrompt,
          maxTokens: 16384,
          temperature: 0.4,
        }
      );

      // Parse AI response
      const docResult = this.parseDocumentationResponse(aiResponse);

      // Validate documentation result
      this.validateDocumentationResult(docResult);

      // Write documentation files
      const filesWritten = await this.writeDocumentation(docResult.documentation);

      // Save documentation artifacts
      const artifactIds: number[] = [];
      for (const doc of docResult.documentation) {
        const artifactId = await this.saveArtifact({
          workflowId: input.workflowId,
          agentExecutionId: this.executionId!,
          type: ArtifactType.DOCUMENTATION,
          content: doc.content,
          metadata: {
            docType: doc.type,
            filePath: doc.file,
            description: doc.description,
          },
        });
        artifactIds.push(artifactId);
      }

      logger.info('Documentation generation complete', {
        filesDocumented: filesWritten.length,
        functions: docResult.coverage.functions,
        classes: docResult.coverage.classes,
      });

      return {
        success: true,
        artifacts: docResult.documentation.map((doc) => ({
          workflowId: input.workflowId,
          agentExecutionId: this.executionId!,
          type: ArtifactType.DOCUMENTATION,
          content: doc.content,
        })),
        summary: `Generated documentation for ${filesWritten.length} files. Coverage: ${docResult.coverage.functions} functions, ${docResult.coverage.classes} classes, ${docResult.coverage.files} files.`,
      };
    } catch (error) {
      logger.error('Document agent failed', error as Error);
      return {
        success: false,
        artifacts: [],
        summary: `Documentation generation failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Load artifacts for documentation
   */
  private async loadArtifactsForDocumentation(workflowId: number): Promise<{
    plan?: any;
    code: any[];
    review?: any;
  }> {
    try {
      const artifacts = await getArtifacts(workflowId);

      // Load plan
      const planArtifacts = artifacts.filter(
        (a: any) => a.type === ArtifactType.PLAN
      );
      const plan =
        planArtifacts.length > 0
          ? JSON.parse(planArtifacts[planArtifacts.length - 1].content)
          : null;

      // Load code artifacts
      const codeArtifacts = artifacts
        .filter((a: any) => a.type === ArtifactType.CODE)
        .map((artifact: any) => ({
          path: artifact.metadata?.filePath || 'unknown',
          content: artifact.content,
          action: artifact.metadata?.action || 'unknown',
        }));

      // Load review
      const reviewArtifacts = artifacts.filter(
        (a: any) => a.type === ArtifactType.REVIEW_REPORT
      );
      const review =
        reviewArtifacts.length > 0
          ? JSON.parse(reviewArtifacts[reviewArtifacts.length - 1].content)
          : null;

      return {
        plan,
        code: codeArtifacts,
        review,
      };
    } catch (error) {
      logger.error('Failed to load artifacts for documentation', error as Error);
      throw new Error(
        `Could not load artifacts: ${(error as Error).message}`
      );
    }
  }

  /**
   * Build documentation prompt
   */
  private buildDocumentationPrompt(artifacts: {
    plan?: any;
    code: any[];
    review?: any;
  }): string {
    const planSection = artifacts.plan
      ? `Implementation Plan:\n${JSON.stringify(artifacts.plan, null, 2)}\n\n`
      : '';

    const codeSection = artifacts.code
      .map(
        (file) =>
          `Code File: ${file.path}\n\`\`\`\n${file.content}\n\`\`\``
      )
      .join('\n\n');

    const reviewSection = artifacts.review
      ? `\n\nReview Results:\n${JSON.stringify(artifacts.review, null, 2)}`
      : '';

    return `
Please generate comprehensive documentation for this code.

${planSection}${codeSection}${reviewSection}

Generate the following types of documentation:
1. **Inline Code Documentation**: JSDoc/TSDoc comments for functions, classes, methods
2. **API Documentation**: Document any endpoints, parameters, responses
3. **README Updates**: Update README with new features/changes
4. **Changelog**: Document changes in CHANGELOG format
5. **Architecture Decisions**: Create ADRs for significant design decisions (if applicable)

Guidelines:
- Be clear and concise
- Include examples where helpful
- Document the "why" not just the "what"
- Keep examples working and tested
- Follow existing documentation style

Respond with JSON in this format:
{
  "success": true,
  "documentation": [
    {
      "type": "code|api|readme|changelog|adr",
      "file": "path/to/file",
      "content": "Full documentation content",
      "description": "What was documented"
    }
  ],
  "summary": "Overview of documentation changes",
  "coverage": {
    "functions": number,
    "classes": number,
    "files": number
  }
}
    `.trim();
  }

  /**
   * Parse documentation response from AI
   */
  private parseDocumentationResponse(response: string): DocumentationResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const result = JSON.parse(jsonMatch[0]);

      return {
        success: result.success !== false,
        documentation: result.documentation || [],
        summary: result.summary || 'Documentation generated',
        coverage: {
          functions: result.coverage?.functions || 0,
          classes: result.coverage?.classes || 0,
          files: result.coverage?.files || 0,
        },
      };
    } catch (error) {
      logger.error('Failed to parse documentation response', error as Error);

      return {
        success: false,
        documentation: [],
        summary: 'Failed to parse documentation response',
        coverage: { functions: 0, classes: 0, files: 0 },
      };
    }
  }

  /**
   * Validate documentation result
   */
  private validateDocumentationResult(result: DocumentationResult): void {
    if (!result.documentation || result.documentation.length === 0) {
      throw new Error('Documentation result must include at least one document');
    }

    for (const doc of result.documentation) {
      if (!doc.file) {
        throw new Error('Each document must have a file path');
      }
      if (!doc.content) {
        throw new Error(`Document ${doc.file} must have content`);
      }
      if (!['code', 'api', 'readme', 'changelog', 'adr'].includes(doc.type)) {
        throw new Error(
          `Invalid document type: ${doc.type}. Must be one of: code, api, readme, changelog, adr`
        );
      }
    }

    logger.debug('Documentation result validation passed');
  }

  /**
   * Write documentation files
   */
  private async writeDocumentation(
    documentation: Array<{
      type: string;
      file: string;
      content: string;
    }>
  ): Promise<string[]> {
    const written: string[] = [];

    for (const doc of documentation) {
      try {
        const fullPath = path.resolve(process.cwd(), doc.file);

        // Handle different documentation types
        if (doc.type === 'code') {
          // For inline code documentation, we need to merge with existing file
          await this.mergeCodeDocumentation(fullPath, doc.content);
        } else if (doc.type === 'readme' || doc.type === 'changelog') {
          // For README/CHANGELOG, append or update sections
          await this.updateMarkdownFile(fullPath, doc.content);
        } else {
          // For API docs and ADRs, write as new files
          const dir = path.dirname(fullPath);
          await fs.mkdir(dir, { recursive: true });
          await writeFile(doc.file, doc.content);
        }

        logger.info('Created/updated documentation', {
          path: doc.file,
          type: doc.type,
        });
        written.push(doc.file);
      } catch (error) {
        logger.error('Failed to write documentation', error as Error, {
          path: doc.file,
        });
        // Don't throw - continue with other documentation
      }
    }

    return written;
  }

  /**
   * Merge code documentation with existing file
   */
  private async mergeCodeDocumentation(
    filePath: string,
    docContent: string
  ): Promise<void> {
    try {
      // For now, just write the documented version
      // In a more sophisticated implementation, we would parse the AST
      // and merge comments intelligently
      await writeFile(filePath, docContent);
    } catch (error) {
      logger.warn('Failed to merge code documentation', {
        error: (error as Error).message,
        file: filePath,
      });
      throw error;
    }
  }

  /**
   * Update markdown file (README/CHANGELOG)
   */
  private async updateMarkdownFile(
    filePath: string,
    newContent: string
  ): Promise<void> {
    try {
      let existingContent = '';
      try {
        existingContent = await readFile(filePath);
      } catch (error) {
        // File doesn't exist yet - that's OK
      }

      let finalContent: string;

      if (existingContent) {
        // Append new content to existing
        // In a more sophisticated implementation, we would parse markdown
        // and intelligently merge sections
        finalContent = `${existingContent}\n\n---\n\n${newContent}`;
      } else {
        finalContent = newContent;
      }

      await writeFile(filePath, finalContent);
    } catch (error) {
      logger.warn('Failed to update markdown file', {
        error: (error as Error).message,
        file: filePath,
      });
      throw error;
    }
  }

  /**
   * Override input validation
   */
  protected validateInput(input: AgentInput): void {
    if (!input.workflowId) {
      throw new Error('Missing required input: workflowId');
    }
  }
}
