/**
 * Security Lint Agent
 * Performs automated security scanning on generated code
 */

import { BaseAgent } from './base-agent.js';
import { AgentType, AgentInput, AgentOutput, ArtifactType } from '../types.js';
import { config } from '../config.js';
import * as logger from '../utils/logger.js';
import { getArtifacts } from '../workflow-state.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Security issue severity levels
 */
export enum SecuritySeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  INFO = 'INFO',
}

/**
 * Security issue detected by linter
 */
interface SecurityIssue {
  severity: SecuritySeverity;
  category: string; // OWASP category or CWE number
  rule: string;
  message: string;
  file: string;
  line?: number;
  column?: number;
  evidence?: string;
  recommendation: string;
}

/**
 * Security lint result
 */
interface SecurityLintResult {
  success: boolean;
  totalIssues: number;
  issuesBySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  issues: SecurityIssue[];
  summary: string;
  blockers: SecurityIssue[]; // Critical/High severity issues that block the workflow
}

export class SecurityLintAgent extends BaseAgent {
  // Security patterns to check (regex-based rules)
  private readonly securityPatterns = [
    // SQL Injection - only flag template literals in actual database queries
    {
      pattern: /\.(query|raw|execute)\s*\([^)]*`[^`]*\$\{/gi,
      severity: SecuritySeverity.HIGH,
      category: 'CWE-89',
      rule: 'no-sql-injection',
      message: 'SQL injection vulnerability: Template literal used in database query',
      recommendation: 'Use parameterized queries or ORM methods instead of string interpolation',
    },
    {
      pattern: /`\s*(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s+[^`]*\$\{/gi,
      severity: SecuritySeverity.HIGH,
      category: 'CWE-89',
      rule: 'no-sql-injection',
      message: 'SQL injection vulnerability: String interpolation in SQL statement',
      recommendation: 'Use prepared statements with parameter binding',
    },
    {
      pattern: /(db|knex|connection|pool|sequelize|mongoose)\.(query|raw|execute)\s*\(`[^`]*\$\{/gi,
      severity: SecuritySeverity.HIGH,
      category: 'CWE-89',
      rule: 'no-sql-injection',
      message: 'SQL injection vulnerability: User input in database query',
      recommendation: 'Use parameterized queries or ORM methods',
    },
    {
      pattern: /exec\([^)]*\$\{/g,
      severity: SecuritySeverity.HIGH,
      category: 'CWE-78',
      rule: 'no-command-injection',
      message: 'Command injection vulnerability: User input in exec()',
      recommendation: 'Use spawn() with argument array instead of shell commands',
    },
    {
      pattern: /eval\(/g,
      severity: SecuritySeverity.CRITICAL,
      category: 'CWE-95',
      rule: 'no-eval',
      message: 'Code injection vulnerability: eval() usage detected',
      recommendation: 'Remove eval() and use safer alternatives',
    },
    {
      pattern: /dangerouslySetInnerHTML/g,
      severity: SecuritySeverity.MEDIUM,
      category: 'CWE-79',
      rule: 'no-xss',
      message: 'Potential XSS: dangerouslySetInnerHTML without sanitization',
      recommendation: 'Use DOMPurify.sanitize() before rendering HTML',
    },
    {
      pattern: /innerHTML\s*=\s*[^;]+(?<!DOMPurify\.sanitize)/g,
      severity: SecuritySeverity.MEDIUM,
      category: 'CWE-79',
      rule: 'no-xss',
      message: 'Potential XSS: innerHTML assignment without sanitization',
      recommendation: 'Sanitize content with DOMPurify before assignment',
    },
    {
      pattern: /Math\.random\(\)/g,
      severity: SecuritySeverity.MEDIUM,
      category: 'CWE-338',
      rule: 'no-weak-random',
      message: 'Weak random number generation: Math.random() is not cryptographically secure',
      recommendation: 'Use crypto.randomBytes() for security-sensitive operations',
    },
    {
      pattern: /password.*console\.log/gi,
      severity: SecuritySeverity.HIGH,
      category: 'CWE-532',
      rule: 'no-password-logging',
      message: 'Sensitive data exposure: Password logging detected',
      recommendation: 'Remove password from logging statements',
    },
    {
      pattern: /(apiKey|api_key|secret|token).*console\.log/gi,
      severity: SecuritySeverity.HIGH,
      category: 'CWE-532',
      rule: 'no-secret-logging',
      message: 'Sensitive data exposure: API key or secret logging detected',
      recommendation: 'Remove sensitive data from logging statements',
    },
    {
      pattern: /bcrypt\.hash\([^,]+,\s*[0-9]\s*\)/g,
      severity: SecuritySeverity.MEDIUM,
      category: 'CWE-916',
      rule: 'bcrypt-cost-factor',
      message: 'Weak password hashing: bcrypt cost factor appears to be < 10',
      recommendation: 'Use bcrypt cost factor of at least 12',
    },
    {
      pattern: /\.env\s*=\s*['"][^'"]+['"]/g,
      severity: SecuritySeverity.CRITICAL,
      category: 'CWE-798',
      rule: 'no-hardcoded-secrets',
      message: 'Hardcoded secrets: Environment variable value hardcoded',
      recommendation: 'Use process.env and store secrets in .env file',
    },
  ];

  constructor() {
    super(AgentType.SECURITY_LINT, config.openrouter.models.testing); // Use testing model for analysis
  }

  /**
   * Execute security lint agent
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    try {
      logger.info('Security lint agent starting', { workflowId: input.workflowId });

      // Load code artifacts
      const codeArtifacts = await this.loadCodeArtifacts(input.workflowId);

      // Run security scans
      const patternIssues = await this.runPatternScans(codeArtifacts);
      const eslintIssues = await this.runESLintSecurityScan(codeArtifacts);

      // Combine all issues
      const allIssues = [...patternIssues, ...eslintIssues];

      // Generate security lint result
      const result = this.generateLintResult(allIssues);

      // Save security lint artifact
      await this.saveArtifact({
        workflowId: input.workflowId,
        agentExecutionId: this.executionId!,
        type: ArtifactType.SECURITY_LINT,
        content: JSON.stringify(result, null, 2),
        metadata: {
          totalIssues: result.totalIssues,
          criticalIssues: result.issuesBySeverity.critical,
          highIssues: result.issuesBySeverity.high,
          blockers: result.blockers.length,
        },
      });

      logger.info('Security lint complete', {
        totalIssues: result.totalIssues,
        blockers: result.blockers.length,
        critical: result.issuesBySeverity.critical,
        high: result.issuesBySeverity.high,
      });

      // Security lint fails if there are blockers (CRITICAL or HIGH severity)
      const success = result.blockers.length === 0;

      return {
        success,
        artifacts: [
          {
            workflowId: input.workflowId,
            agentExecutionId: this.executionId!,
            type: ArtifactType.SECURITY_LINT,
            content: JSON.stringify(result, null, 2),
          },
        ],
        summary: result.summary,
      };
    } catch (error) {
      logger.error('Security lint agent failed', error as Error);
      return {
        success: false,
        artifacts: [],
        summary: `Security lint failed: ${(error as Error).message}`,
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
   * Run pattern-based security scans on code
   */
  private async runPatternScans(
    codeArtifacts: Array<{ path: string; content: string }>
  ): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    for (const artifact of codeArtifacts) {
      // Skip non-TypeScript/JavaScript files
      if (!artifact.path.match(/\.(ts|js|tsx|jsx)$/)) {
        continue;
      }

      const lines = artifact.content.split('\n');

      for (const patternRule of this.securityPatterns) {
        let lineNumber = 0;

        for (const line of lines) {
          lineNumber++;

          const matches = line.match(patternRule.pattern);
          if (matches) {
            for (const match of matches) {
              issues.push({
                severity: patternRule.severity,
                category: patternRule.category,
                rule: patternRule.rule,
                message: patternRule.message,
                file: artifact.path,
                line: lineNumber,
                column: line.indexOf(match) + 1,
                evidence: line.trim(),
                recommendation: patternRule.recommendation,
              });
            }
          }
        }
      }

      // Check for missing security imports
      if (artifact.content.includes('bcrypt') && !artifact.content.includes('import.*bcrypt')) {
        issues.push({
          severity: SecuritySeverity.INFO,
          category: 'Best Practice',
          rule: 'missing-import',
          message: 'bcrypt usage detected but import not found',
          file: artifact.path,
          recommendation: 'Ensure bcrypt is properly imported',
        });
      }

      // Check for authentication/authorization
      if (
        artifact.path.includes('api') ||
        artifact.path.includes('route') ||
        artifact.path.includes('controller')
      ) {
        const hasAuthCheck =
          artifact.content.includes('authMiddleware') ||
          artifact.content.includes('authenticate') ||
          artifact.content.includes('authorize') ||
          artifact.content.includes('checkPermission');

        if (!hasAuthCheck) {
          issues.push({
            severity: SecuritySeverity.MEDIUM,
            category: 'CWE-284',
            rule: 'missing-auth-check',
            message: 'API endpoint may be missing authentication/authorization checks',
            file: artifact.path,
            recommendation:
              'Add authentication middleware and verify user permissions',
          });
        }
      }
    }

    logger.debug('Pattern scan complete', { issuesFound: issues.length });
    return issues;
  }

  /**
   * Run ESLint with security plugins
   */
  private async runESLintSecurityScan(
    codeArtifacts: Array<{ path: string; content: string }>
  ): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    try {
      // Get list of files to scan
      const filesToScan = codeArtifacts
        .filter((a) => a.path.match(/\.(ts|js|tsx|jsx)$/))
        .map((a) => a.path);

      if (filesToScan.length === 0) {
        return issues;
      }

      // Check if ESLint is available
      try {
        await execAsync('npx eslint --version', { cwd: process.cwd() });
      } catch {
        logger.warn('ESLint not available, skipping ESLint security scan');
        return issues;
      }

      // Run ESLint with security plugins (if available)
      const filesArg = filesToScan.join(' ');
      const { stdout } = await execAsync(
        `npx eslint --format json --no-eslintrc --plugin security --rule 'security/detect-object-injection:error' --rule 'security/detect-non-literal-fs-filename:warn' --rule 'security/detect-eval-with-expression:error' ${filesArg}`,
        {
          cwd: process.cwd(),
          timeout: 60000, // 1 minute timeout
        }
      );

      // Parse ESLint JSON output
      const eslintResults = JSON.parse(stdout);

      for (const result of eslintResults) {
        for (const message of result.messages) {
          // Map ESLint severity to our severity levels
          let severity = SecuritySeverity.INFO;
          if (message.severity === 2) {
            // ESLint error
            severity = message.ruleId?.includes('injection')
              ? SecuritySeverity.HIGH
              : SecuritySeverity.MEDIUM;
          } else if (message.severity === 1) {
            // ESLint warning
            severity = SecuritySeverity.LOW;
          }

          issues.push({
            severity,
            category: 'ESLint Security',
            rule: message.ruleId || 'unknown',
            message: message.message,
            file: result.filePath,
            line: message.line,
            column: message.column,
            evidence: message.source || '',
            recommendation: 'Review ESLint security rule documentation',
          });
        }
      }

      logger.debug('ESLint scan complete', { issuesFound: issues.length });
    } catch (error: any) {
      // ESLint not available or other error - don't fail the entire scan
      logger.warn('ESLint security scan failed', {
        error: error.message,
      });

      // If error has stdout (ESLint found issues), try to parse it
      if (error.stdout) {
        try {
          const eslintResults = JSON.parse(error.stdout);
          // Process results as above (same logic)
          for (const result of eslintResults) {
            for (const message of result.messages) {
              let severity = SecuritySeverity.INFO;
              if (message.severity === 2) {
                severity = message.ruleId?.includes('injection')
                  ? SecuritySeverity.HIGH
                  : SecuritySeverity.MEDIUM;
              } else if (message.severity === 1) {
                severity = SecuritySeverity.LOW;
              }

              issues.push({
                severity,
                category: 'ESLint Security',
                rule: message.ruleId || 'unknown',
                message: message.message,
                file: result.filePath,
                line: message.line,
                column: message.column,
                evidence: message.source || '',
                recommendation: 'Review ESLint security rule documentation',
              });
            }
          }
        } catch {
          // Could not parse - skip ESLint results
        }
      }
    }

    return issues;
  }

  /**
   * Generate security lint result from issues
   */
  private generateLintResult(issues: SecurityIssue[]): SecurityLintResult {
    // Count issues by severity
    const issuesBySeverity = {
      critical: issues.filter((i) => i.severity === SecuritySeverity.CRITICAL)
        .length,
      high: issues.filter((i) => i.severity === SecuritySeverity.HIGH).length,
      medium: issues.filter((i) => i.severity === SecuritySeverity.MEDIUM).length,
      low: issues.filter((i) => i.severity === SecuritySeverity.LOW).length,
      info: issues.filter((i) => i.severity === SecuritySeverity.INFO).length,
    };

    // Blockers are CRITICAL or HIGH severity issues
    const blockers = issues.filter(
      (i) =>
        i.severity === SecuritySeverity.CRITICAL ||
        i.severity === SecuritySeverity.HIGH
    );

    // Generate summary
    let summary = `Security lint found ${issues.length} issue(s): `;
    const parts: string[] = [];

    if (issuesBySeverity.critical > 0) {
      parts.push(`${issuesBySeverity.critical} CRITICAL`);
    }
    if (issuesBySeverity.high > 0) {
      parts.push(`${issuesBySeverity.high} HIGH`);
    }
    if (issuesBySeverity.medium > 0) {
      parts.push(`${issuesBySeverity.medium} MEDIUM`);
    }
    if (issuesBySeverity.low > 0) {
      parts.push(`${issuesBySeverity.low} LOW`);
    }
    if (issuesBySeverity.info > 0) {
      parts.push(`${issuesBySeverity.info} INFO`);
    }

    summary += parts.join(', ');

    if (blockers.length > 0) {
      summary += `. ${blockers.length} blocker(s) must be fixed before proceeding.`;
    } else if (issues.length === 0) {
      summary = 'Security lint passed - no issues detected';
    } else {
      summary += '. No blockers detected.';
    }

    return {
      success: blockers.length === 0,
      totalIssues: issues.length,
      issuesBySeverity,
      issues,
      summary,
      blockers,
    };
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
