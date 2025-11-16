/**
 * Test Agent
 * Generates and executes tests for code changes
 */

import { BaseAgent } from './base-agent.js';
import { AgentType, AgentInput, AgentOutput, ArtifactType } from '../types.js';
import { config } from '../config.js';
import * as logger from '../utils/logger.js';
import { getArtifacts } from '../workflow-state.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

/**
 * Test generation result from AI
 */
interface TestGenerationResult {
  success: boolean;
  testsGenerated: number;
  testFiles: Array<{
    path: string;
    content: string;
    description: string;
  }>;
  execution?: {
    ran: boolean;
    passed: number;
    failed: number;
    coverage: number;
    failures: Array<{
      test: string;
      error: string;
      suggestion: string;
    }>;
  };
  recommendations: string[];
}

/**
 * Parsed test results from Jest
 */
interface TestResults {
  passed: number;
  failed: number;
  coverage: number;
  failures: Array<{
    test: string;
    error: string;
    suggestion: string;
  }>;
}

export class TestAgent extends BaseAgent {
  constructor() {
    super(AgentType.TEST, config.openrouter.models.testing);
  }

  /**
   * Execute test agent
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    try {
      logger.info('Test agent starting', { workflowId: input.workflowId });

      // Ensure workingDir is provided
      if (!input.workingDir) {
        throw new Error('workingDir is required for test agent');
      }

      // Verify workingDir exists
      try {
        await fs.access(input.workingDir);
      } catch (error) {
        throw new Error(`Working directory does not exist: ${input.workingDir}`);
      }

      // Load code artifacts
      const codeArtifacts = await this.loadCodeArtifacts(input.workflowId);

      // Load plan artifact for context
      const plan = await this.loadPlanArtifact(input.workflowId);

      // Load system prompt
      const systemPrompt = await this.loadSystemPrompt('test-agent-prompt.md');

      // Build testing prompt
      const userPrompt = this.buildTestingPrompt(plan, codeArtifacts);

      // Call AI API
      logger.info('Calling AI for test generation');
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
          temperature: 0.3,
        }
      );

      // Parse AI response
      const testResult = this.parseTestResponse(aiResponse);

      // Validate test result
      this.validateTestResult(testResult);

      // Write test files
      await this.writeTestFiles(testResult.testFiles, input.workingDir);

      // Run TypeScript build check first
      logger.info('Running TypeScript build check');
      const buildCheck = await this.runBuildCheck(input.workingDir);
      if (!buildCheck.success) {
        // Build failed - return failure immediately
        logger.error('TypeScript build failed', new Error(buildCheck.errors.join('; ')));
        return {
          success: false,
          artifacts: testResult.testFiles.map((file) => ({
            workflowId: input.workflowId,
            agentExecutionId: this.executionId!,
            type: ArtifactType.TEST,
            content: file.content,
          })),
          summary: `Build check failed: ${buildCheck.errors.join('; ')}. Tests were not executed.`,
        };
      }

      // Execute tests
      logger.info('Running tests');
      const testExecution = await this.runTests(input.workingDir);

      // Update result with execution data
      testResult.execution = { ran: true, ...testExecution };

      // Save test artifacts
      const artifactIds: number[] = [];
      for (const testFile of testResult.testFiles) {
        const artifactId = await this.saveArtifact({
          workflowId: input.workflowId,
          agentExecutionId: this.executionId!,
          type: ArtifactType.TEST,
          content: testFile.content,
          metadata: {
            testFilePath: testFile.path,
            description: testFile.description,
            passed: testExecution.passed,
            failed: testExecution.failed,
            coverage: testExecution.coverage,
          },
        });
        artifactIds.push(artifactId);
      }

      // Generate recommendations if tests failed
      const recommendations = this.generateRecommendations(
        testExecution,
        testResult.recommendations
      );

      logger.info('Test generation and execution complete', {
        testsGenerated: testResult.testsGenerated,
        passed: testExecution.passed,
        failed: testExecution.failed,
        coverage: testExecution.coverage,
      });

      return {
        success: testExecution.failed === 0,
        artifacts: testResult.testFiles.map((file) => ({
          workflowId: input.workflowId,
          agentExecutionId: this.executionId!,
          type: ArtifactType.TEST,
          content: file.content,
        })),
        summary: `Generated ${testResult.testsGenerated} tests. ${testExecution.passed} passed, ${testExecution.failed} failed. Coverage: ${testExecution.coverage}%. ${recommendations.length > 0 ? 'Recommendations: ' + recommendations.join('; ') : ''}`,
      };
    } catch (error) {
      logger.error('Test agent failed', error as Error);
      return {
        success: false,
        artifacts: [],
        summary: `Test generation failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Load code artifacts from workflow
   */
  private async loadCodeArtifacts(workflowId: number): Promise<any[]> {
    try {
      const artifacts = await getArtifacts(workflowId);
      const codeArtifacts = artifacts.filter(
        (a: any) => a.type === ArtifactType.CODE
      );

      if (codeArtifacts.length === 0) {
        throw new Error('No code artifacts found - Code agent must run first');
      }

      return codeArtifacts.map((artifact: any) => ({
        path: artifact.metadata?.filePath || 'unknown',
        content: artifact.content,
        action: artifact.metadata?.action || 'unknown',
      }));
    } catch (error) {
      logger.error('Failed to load code artifacts', error as Error);
      throw new Error(
        `Could not load code artifacts: ${(error as Error).message}`
      );
    }
  }

  /**
   * Load plan artifact
   */
  private async loadPlanArtifact(workflowId: number): Promise<any> {
    try {
      const artifacts = await getArtifacts(workflowId);
      const planArtifacts = artifacts.filter(
        (a: any) => a.type === ArtifactType.PLAN
      );

      if (planArtifacts.length === 0) {
        return null; // Plan is optional
      }

      const planArtifact = planArtifacts[planArtifacts.length - 1];
      return JSON.parse(planArtifact.content);
    } catch (error) {
      logger.warn('Failed to load plan artifact', {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Build testing prompt
   */
  private buildTestingPrompt(plan: any, codeArtifacts: any[]): string {
    const planSummary = plan
      ? `Plan: ${plan.summary}\nTest Strategy: ${plan.testStrategy}`
      : 'No plan available';

    const codeFiles = codeArtifacts
      .map((artifact) => `File: ${artifact.path}\n\`\`\`\n${artifact.content}\n\`\`\``)
      .join('\n\n');

    return `
${planSummary}

Code to Test:
${codeFiles}

Please generate comprehensive Jest tests for this code. Follow these guidelines:
1. Use FIRST principles (Fast, Independent, Repeatable, Self-validating, Timely)
2. Test both happy paths and edge cases
3. Include unit tests for individual functions
4. Add integration tests for connected components
5. Mock external dependencies
6. Aim for >80% code coverage
7. Use descriptive test names

Respond with JSON in this format:
{
  "success": true,
  "testsGenerated": number,
  "testFiles": [
    {
      "path": "tests/unit/example.test.ts",
      "content": "full test file content",
      "description": "what these tests verify"
    }
  ],
  "recommendations": ["suggestions for improving testability"]
}
    `.trim();
  }

  /**
   * Parse test response from AI
   */
  private parseTestResponse(response: string): TestGenerationResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const result = JSON.parse(jsonMatch[0]);

      return {
        success: result.success !== false,
        testsGenerated: result.testsGenerated || 0,
        testFiles: result.testFiles || [],
        recommendations: result.recommendations || [],
      };
    } catch (error) {
      logger.error('Failed to parse test response', error as Error);

      return {
        success: false,
        testsGenerated: 0,
        testFiles: [],
        recommendations: ['Failed to parse AI response'],
      };
    }
  }

  /**
   * Validate test result
   */
  private validateTestResult(result: TestGenerationResult): void {
    if (!result.testFiles || result.testFiles.length === 0) {
      throw new Error('Test result must include at least one test file');
    }

    for (const testFile of result.testFiles) {
      if (!testFile.path) {
        throw new Error('Each test file must have a path');
      }
      if (!testFile.content) {
        throw new Error(`Test file ${testFile.path} must have content`);
      }
    }

    logger.debug('Test result validation passed');
  }

  /**
   * Write test files to disk
   */
  private async writeTestFiles(
    testFiles: Array<{ path: string; content: string }>,
    workingDir: string
  ): Promise<string[]> {
    const written: string[] = [];

    for (const testFile of testFiles) {
      try {
        // Construct absolute path within workingDir
        const absolutePath = path.isAbsolute(testFile.path)
          ? testFile.path
          : path.join(workingDir, testFile.path);

        // Ensure directory exists
        const directory = path.dirname(absolutePath);
        await fs.mkdir(directory, { recursive: true });

        // Write file directly
        await fs.writeFile(absolutePath, testFile.content, 'utf-8');

        logger.info('Created test file', { path: testFile.path, absolutePath });
        written.push(testFile.path);
      } catch (error) {
        logger.error('Failed to write test file', error as Error, {
          path: testFile.path,
        });
        throw new Error(
          `Failed to write test file ${testFile.path}: ${(error as Error).message}`
        );
      }
    }

    return written;
  }

  /**
   * Run TypeScript build check
   */
  private async runBuildCheck(workingDir: string): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Check if this is a TypeScript project by looking for tsconfig.json
      const tsconfigPath = path.join(workingDir, 'tsconfig.json');
      try {
        await fs.access(tsconfigPath);
      } catch {
        // Not a TypeScript project, skip build check
        logger.info('No tsconfig.json found, skipping TypeScript build check');
        return { success: true, errors: [] };
      }

      logger.info('Running TypeScript compilation check', { workingDir });

      // Run tsc --noEmit to check for type errors without generating output
      const { stderr } = await execAsync('npx tsc --noEmit', {
        cwd: workingDir,
        timeout: 120000, // 2 minute timeout
      });

      // tsc outputs errors to stderr
      if (stderr && stderr.trim().length > 0) {
        const errorLines = stderr.split('\n').filter(line => line.trim());
        errors.push(...errorLines.slice(0, 10)); // Limit to first 10 errors
      }

      return { success: errors.length === 0, errors };
    } catch (error: any) {
      // tsc returns non-zero exit code if there are type errors
      if (error.stderr) {
        const errorLines = error.stderr.split('\n').filter((line: string) => line.trim());
        errors.push(...errorLines.slice(0, 10)); // Limit to first 10 errors
      } else {
        errors.push((error as Error).message);
      }

      logger.warn('TypeScript build check failed', {
        errorCount: errors.length,
        errors: errors.slice(0, 3), // Log first 3 errors
      });

      return { success: false, errors };
    }
  }

  /**
   * Run tests using Jest
   */
  private async runTests(workingDir: string): Promise<TestResults> {
    try {
      const { stdout } = await execAsync('npm test -- --json', {
        cwd: workingDir,
        timeout: 120000, // 2 minute timeout
      });

      // Parse Jest JSON output
      return this.parseJestOutput(stdout);
    } catch (error: any) {
      // npm test returns non-zero exit code if tests fail
      // Parse the output anyway
      if (error.stdout) {
        return this.parseJestOutput(error.stdout);
      }

      logger.warn('Failed to run tests', {
        error: (error as Error).message,
      });

      return {
        passed: 0,
        failed: 0,
        coverage: 0,
        failures: [
          {
            test: 'Test execution',
            error: `Failed to run tests: ${(error as Error).message}`,
            suggestion: 'Check test configuration and ensure Jest is properly set up',
          },
        ],
      };
    }
  }

  /**
   * Parse Jest JSON output
   */
  private parseJestOutput(output: string): TestResults {
    try {
      const json = JSON.parse(output);

      const passed = json.numPassedTests || 0;
      const failed = json.numFailedTests || 0;
      const coverage = json.coverageMap
        ? this.calculateCoverage(json.coverageMap)
        : 0;

      const failures: Array<{ test: string; error: string; suggestion: string }> = [];
      if (json.testResults) {
        for (const testResult of json.testResults) {
          if (testResult.assertionResults) {
            for (const assertion of testResult.assertionResults) {
              if (assertion.status === 'failed') {
                failures.push({
                  test: assertion.fullName || assertion.title,
                  error:
                    assertion.failureMessages?.[0] ||
                    'Test failed with unknown error',
                  suggestion: 'Review test assertion and fix implementation',
                });
              }
            }
          }
        }
      }

      return { passed, failed, coverage, failures };
    } catch (error) {
      logger.warn('Failed to parse Jest output', {
        error: (error as Error).message,
      });

      // Try basic parsing as fallback
      const passedMatch = output.match(/(\d+) passed/);
      const failedMatch = output.match(/(\d+) failed/);

      return {
        passed: passedMatch ? parseInt(passedMatch[1]) : 0,
        failed: failedMatch ? parseInt(failedMatch[1]) : 0,
        coverage: 0,
        failures: [],
      };
    }
  }

  /**
   * Calculate code coverage percentage
   */
  private calculateCoverage(coverageMap: any): number {
    try {
      let totalStatements = 0;
      let coveredStatements = 0;

      for (const file in coverageMap) {
        const fileCoverage = coverageMap[file];
        if (fileCoverage.s) {
          totalStatements += Object.keys(fileCoverage.s).length;
          coveredStatements += Object.values(fileCoverage.s).filter(
            (count: any) => count > 0
          ).length;
        }
      }

      return totalStatements > 0
        ? Math.round((coveredStatements / totalStatements) * 100)
        : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Generate recommendations based on test results
   */
  private generateRecommendations(
    execution: TestResults,
    aiRecommendations: string[]
  ): string[] {
    const recommendations = [...aiRecommendations];

    if (execution.failed > 0) {
      recommendations.push(
        `${execution.failed} test(s) failed. Review failures and fix code.`
      );
    }

    if (execution.coverage < 80) {
      recommendations.push(
        `Code coverage is ${execution.coverage}%. Aim for at least 80%.`
      );
    }

    return recommendations;
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
