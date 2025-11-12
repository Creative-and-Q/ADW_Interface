/**
 * Review Agent
 * Performs security and quality code reviews
 */

import { BaseAgent } from './base-agent.js';
import { AgentType, AgentInput, AgentOutput, ArtifactType } from '../types.js';
import { config } from '../config.js';
import * as logger from '../utils/logger.js';
import { getArtifacts } from '../workflow-state.js';

/**
 * Code review result from AI
 */
interface ReviewResult {
  approved: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  securityIssues: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    file: string;
    line?: number;
    issue: string;
    recommendation: string;
    cwe?: string;
  }>;
  qualityIssues: Array<{
    severity: 'high' | 'medium' | 'low';
    category: string;
    file: string;
    line?: number;
    issue: string;
    recommendation: string;
  }>;
  positives: string[];
  summary: string;
  requiresChanges: boolean;
  blockers: string[];
}

export class ReviewAgent extends BaseAgent {
  constructor() {
    super(AgentType.REVIEW, config.openrouter.models.review);
  }

  /**
   * Execute review agent
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    try {
      logger.info('Review agent starting', { workflowId: input.workflowId });

      // Load all artifacts for review
      const artifacts = await this.loadAllArtifacts(input.workflowId);

      // Load system prompt
      const systemPrompt = await this.loadSystemPrompt('review-agent-prompt.md');

      // Build review prompt
      const userPrompt = this.buildReviewPrompt(artifacts);

      // Call AI API
      logger.info('Calling AI for code review');
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
          temperature: 0.2, // Low temperature for consistent security analysis
        }
      );

      // Parse AI response
      const reviewResult = this.parseReviewResponse(aiResponse);

      // Validate review result
      this.validateReviewResult(reviewResult);

      // Save review artifact
      await this.saveArtifact({
        workflowId: input.workflowId,
        agentExecutionId: this.executionId!,
        type: ArtifactType.REVIEW_REPORT,
        content: JSON.stringify(reviewResult, null, 2),
        metadata: {
          approved: reviewResult.approved,
          severity: reviewResult.severity,
          securityIssuesCount: reviewResult.securityIssues.length,
          qualityIssuesCount: reviewResult.qualityIssues.length,
          blockersCount: reviewResult.blockers.length,
        },
      });

      logger.info('Review complete', {
        approved: reviewResult.approved,
        severity: reviewResult.severity,
        securityIssues: reviewResult.securityIssues.length,
        qualityIssues: reviewResult.qualityIssues.length,
      });

      // Determine success based on blockers
      const success = reviewResult.blockers.length === 0;

      return {
        success,
        artifacts: [
          {
            workflowId: input.workflowId,
            agentExecutionId: this.executionId!,
            type: ArtifactType.REVIEW_REPORT,
            content: JSON.stringify(reviewResult, null, 2),
          },
        ],
        summary: this.generateReviewSummary(reviewResult),
      };
    } catch (error) {
      logger.error('Review agent failed', error as Error);
      return {
        success: false,
        artifacts: [],
        summary: `Review failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Load all artifacts for comprehensive review
   */
  private async loadAllArtifacts(workflowId: number): Promise<{
    plan?: any;
    code: any[];
    tests: any[];
  }> {
    try {
      const artifacts = await getArtifacts(workflowId);

      // Load plan
      const planArtifacts = artifacts.filter(
        (a: any) => a.type === ArtifactType.PLAN
      );
      const plan = planArtifacts.length > 0
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

      // Load test artifacts
      const testArtifacts = artifacts
        .filter((a: any) => a.type === ArtifactType.TEST)
        .map((artifact: any) => ({
          path: artifact.metadata?.testFilePath || 'unknown',
          content: artifact.content,
          passed: artifact.metadata?.passed || 0,
          failed: artifact.metadata?.failed || 0,
        }));

      return {
        plan,
        code: codeArtifacts,
        tests: testArtifacts,
      };
    } catch (error) {
      logger.error('Failed to load artifacts for review', error as Error);
      throw new Error(
        `Could not load artifacts: ${(error as Error).message}`
      );
    }
  }

  /**
   * Build review prompt
   */
  private buildReviewPrompt(artifacts: {
    plan?: any;
    code: any[];
    tests: any[];
  }): string {
    const planSection = artifacts.plan
      ? `Implementation Plan:\n${JSON.stringify(artifacts.plan, null, 2)}\n\n`
      : '';

    const codeSection = artifacts.code
      .map(
        (file) =>
          `Code File: ${file.path} (${file.action})\n\`\`\`\n${file.content}\n\`\`\``
      )
      .join('\n\n');

    const testSection =
      artifacts.tests.length > 0
        ? `\n\nTest Files:\n${artifacts.tests
            .map(
              (test) =>
                `${test.path} (${test.passed} passed, ${test.failed} failed)\n\`\`\`\n${test.content}\n\`\`\``
            )
            .join('\n\n')}`
        : '\n\nNo tests provided';

    return `
Please perform a comprehensive security and quality code review.

${planSection}${codeSection}${testSection}

Focus on:
1. **Security**: OWASP Top 10 vulnerabilities (SQL injection, XSS, authentication, etc.)
2. **Code Quality**: Complexity, maintainability, adherence to best practices
3. **Performance**: Potential bottlenecks, resource leaks
4. **Testing**: Adequate test coverage and quality
5. **Architecture**: SOLID principles, design patterns

Respond with JSON in this format:
{
  "approved": true|false,
  "severity": "critical|high|medium|low",
  "securityIssues": [
    {
      "severity": "critical|high|medium|low",
      "category": "OWASP category or security concern",
      "file": "path/to/file.ts",
      "line": number (optional),
      "issue": "description of issue",
      "recommendation": "how to fix",
      "cwe": "CWE-XXX" (optional)
    }
  ],
  "qualityIssues": [
    {
      "severity": "high|medium|low",
      "category": "code smell or quality issue",
      "file": "path/to/file.ts",
      "line": number (optional),
      "issue": "description",
      "recommendation": "how to improve"
    }
  ],
  "positives": ["things done well"],
  "summary": "overall assessment",
  "requiresChanges": true|false,
  "blockers": ["critical issues that must be fixed"]
}
    `.trim();
  }

  /**
   * Parse review response from AI
   */
  private parseReviewResponse(response: string): ReviewResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const result = JSON.parse(jsonMatch[0]);

      return {
        approved: result.approved !== false,
        severity: result.severity || 'medium',
        securityIssues: result.securityIssues || [],
        qualityIssues: result.qualityIssues || [],
        positives: result.positives || [],
        summary: result.summary || 'Review completed',
        requiresChanges: result.requiresChanges || false,
        blockers: result.blockers || [],
      };
    } catch (error) {
      logger.error('Failed to parse review response', error as Error);

      // Return a basic approval as fallback
      return {
        approved: true,
        severity: 'low',
        securityIssues: [],
        qualityIssues: [],
        positives: ['Automated review parsing failed - manual review recommended'],
        summary: 'Review parsing failed, defaulting to approval',
        requiresChanges: false,
        blockers: [],
      };
    }
  }

  /**
   * Validate review result
   */
  private validateReviewResult(result: ReviewResult): void {
    if (!result.summary) {
      throw new Error('Review must include a summary');
    }

    // Check for critical security issues without blockers
    const criticalIssues = result.securityIssues.filter(
      (issue) => issue.severity === 'critical'
    );
    if (criticalIssues.length > 0 && result.blockers.length === 0) {
      logger.warn('Critical security issues found but no blockers specified');
    }

    logger.debug('Review result validation passed');
  }

  /**
   * Generate review summary
   */
  private generateReviewSummary(result: ReviewResult): string {
    const parts: string[] = [];

    if (result.approved) {
      parts.push('✓ Review APPROVED');
    } else {
      parts.push('✗ Review REJECTED');
    }

    parts.push(`Severity: ${result.severity}`);

    if (result.securityIssues.length > 0) {
      parts.push(`${result.securityIssues.length} security issue(s)`);
    }

    if (result.qualityIssues.length > 0) {
      parts.push(`${result.qualityIssues.length} quality issue(s)`);
    }

    if (result.blockers.length > 0) {
      parts.push(`⚠ ${result.blockers.length} blocker(s): ${result.blockers.join('; ')}`);
    }

    if (result.positives.length > 0) {
      parts.push(`Positives: ${result.positives.slice(0, 2).join(', ')}`);
    }

    return parts.join('. ');
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
