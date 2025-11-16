#!/usr/bin/env tsx
/**
 * Auto-Fix Workflow Script
 * Automatically investigates workflow failures, generates fixes, and retries the workflow
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const execAsync = promisify(exec);

interface WorkflowInfo {
  id: number;
  status: string;
  branchName: string;
  workflowType: string;
  taskDescription: string;
  error: string;
  failedStage: string;
  created_at: string;
  completed_at: string;
}

interface InvestigationResult {
  workflowId: number;
  rootCause: string;
  failedStage: string;
  errorType: string;
  fixable: boolean;
  suggestedFix?: string;
  affectedFiles?: string[];
  fullReport: string;
}

interface FixResult {
  success: boolean;
  filesModified: string[];
  commitHash?: string;
  error?: string;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Main auto-fix workflow function
 */
async function autoFixWorkflow(workflowId: number): Promise<void> {
  console.log(`\n🔧 Auto-Fix Workflow ${workflowId} - Starting...\n`);

  try {
    // Step 1: Get workflow information
    console.log('📊 Step 1: Gathering workflow information...');
    const workflowInfo = await getWorkflowInfo(workflowId);
    console.log(`   - Workflow Type: ${workflowInfo.workflowType}`);
    console.log(`   - Failed Stage: ${workflowInfo.failedStage}`);
    console.log(`   - Error: ${workflowInfo.error}\n`);

    // Step 2: Investigate the failure
    console.log('🔍 Step 2: Investigating failure...');
    const investigation = await investigateFailure(workflowId, workflowInfo);
    console.log(`   - Root Cause: ${investigation.rootCause}`);
    console.log(`   - Error Type: ${investigation.errorType}`);
    console.log(`   - Fixable: ${investigation.fixable ? 'Yes' : 'No'}\n`);

    if (!investigation.fixable) {
      console.log('❌ Error is not automatically fixable. Manual intervention required.');
      console.log('\nInvestigation Report:');
      console.log(investigation.fullReport);
      return;
    }

    // Step 3: Generate and apply fix
    console.log('🛠️  Step 3: Generating fix...');
    const fixResult = await generateAndApplyFix(investigation);

    if (!fixResult.success) {
      console.log(`❌ Failed to apply fix: ${fixResult.error}`);
      return;
    }

    console.log(`   ✅ Fix applied successfully`);
    console.log(`   - Files modified: ${fixResult.filesModified.join(', ')}`);
    console.log(`   - Commit: ${fixResult.commitHash}\n`);

    // Step 4: Commit and push to develop
    console.log('📤 Step 4: Committing and pushing fix...');
    await commitAndPushFix(investigation, fixResult);
    console.log('   ✅ Changes pushed to develop\n');

    // Step 5: Trigger rebuild & restart
    console.log('🔄 Step 5: Triggering rebuild & restart...');
    await triggerRebuildRestart();
    console.log('   ✅ Rebuild & restart triggered\n');

    // Wait for restart to complete
    console.log('⏳ Waiting for system to restart (30 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Step 6: Create new workflow with original parameters
    console.log('🚀 Step 6: Creating new workflow...');
    const newWorkflowId = await createNewWorkflow(workflowInfo);
    console.log(`   ✅ New workflow created: #${newWorkflowId}\n`);

    console.log('✅ Auto-fix workflow completed successfully!');
    console.log(`   - Original workflow: #${workflowId}`);
    console.log(`   - New workflow: #${newWorkflowId}`);
    console.log(`   - Fix commit: ${fixResult.commitHash}`);

  } catch (error) {
    console.error('❌ Auto-fix workflow failed:', error);
    throw error;
  }
}

/**
 * Get workflow information from database
 */
async function getWorkflowInfo(workflowId: number): Promise<WorkflowInfo> {
  // Read workflow README
  const workflowDirs = await execAsync(
    `find workflows -maxdepth 1 -type d -name "workflow-${workflowId}-*"`
  );

  const workflowDir = workflowDirs.stdout.trim().split('\n')[0];
  if (!workflowDir) {
    throw new Error(`Workflow directory not found for workflow ${workflowId}`);
  }

  const readmePath = path.join(workflowDir, 'README.md');
  const readme = await fs.readFile(readmePath, 'utf-8');

  // Parse README for workflow info
  const branchMatch = readme.match(/\*\*Branch:\*\* `([^`]+)`/);
  const statusMatch = readme.match(/\*\*Status:\*\* (.*)/);
  const completedMatch = readme.match(/\*\*Completed:\*\* (.*)/);
  const createdMatch = readme.match(/\*\*Created:\*\* (.*)/);
  const summaryMatch = readme.match(/## Final Summary\n\n(.*)/);

  // Extract error and failed stage from summary
  const summary = summaryMatch ? summaryMatch[1] : '';
  const failedStageMatch = summary.match(/failed at (\w+):/i);
  const errorMatch = summary.match(/: (.+)$/);

  // Get workflow details from logs
  const logFiles = await execAsync(`ls -t ${workflowDir}/logs/ | head -1`);
  const latestLog = path.join(workflowDir, 'logs', logFiles.stdout.trim());
  const logContent = JSON.parse(await fs.readFile(latestLog, 'utf-8'));

  return {
    id: workflowId,
    status: statusMatch ? statusMatch[1].replace('❌ ', '').trim() : 'Failed',
    branchName: branchMatch ? branchMatch[1] : '',
    workflowType: logContent.workflowType || 'feature',
    taskDescription: logContent.taskDescription || '',
    error: errorMatch ? errorMatch[1] : summary,
    failedStage: failedStageMatch ? failedStageMatch[1].toLowerCase() : logContent.agentType || 'unknown',
    created_at: createdMatch ? createdMatch[1] : '',
    completed_at: completedMatch ? completedMatch[1] : '',
  };
}

/**
 * Investigate the workflow failure using AI
 */
async function investigateFailure(
  workflowId: number,
  workflowInfo: WorkflowInfo
): Promise<InvestigationResult> {
  // Gather investigation data
  const workflowDir = (await execAsync(
    `find workflows -maxdepth 1 -type d -name "workflow-${workflowId}-*"`
  )).stdout.trim().split('\n')[0];

  // Read all log files
  const logs = await execAsync(`find ${workflowDir}/logs -name "*.json" -exec cat {} \\;`);
  const logData = logs.stdout;

  // Read relevant source files
  const sourceFiles = await gatherRelevantSourceFiles(workflowInfo.failedStage);

  // Create investigation prompt
  const investigationPrompt = `You are investigating a failed workflow. Your task is to:
1. Identify the root cause of the failure
2. Determine if the error is automatically fixable
3. If fixable, provide the exact fix needed

## Workflow Information
- Workflow ID: ${workflowId}
- Workflow Type: ${workflowInfo.workflowType}
- Task Description: ${workflowInfo.taskDescription}
- Failed Stage: ${workflowInfo.failedStage}
- Error: ${workflowInfo.error}

## Log Data
${logData}

## Relevant Source Files
${sourceFiles}

## Analysis Required
Please analyze this failure and provide:

1. **Root Cause**: A clear explanation of what caused the failure
2. **Error Type**: Classification (code_error, validation_error, token_limit, api_error, infrastructure_error)
3. **Fixable**: Can this be automatically fixed? (true/false)
4. **Affected Files**: List of files that need to be modified
5. **Suggested Fix**: If fixable, provide the exact code changes needed

Respond in JSON format:
{
  "rootCause": "detailed explanation",
  "errorType": "code_error | validation_error | token_limit | api_error | infrastructure_error",
  "fixable": true | false,
  "affectedFiles": ["file1.ts", "file2.ts"],
  "suggestedFix": "detailed fix description with code snippets",
  "fullReport": "complete investigation report in markdown"
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [
      {
        role: 'user',
        content: investigationPrompt,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  // Parse JSON response
  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in investigation response');
  }

  const result = JSON.parse(jsonMatch[0]);

  return {
    workflowId,
    rootCause: result.rootCause,
    failedStage: workflowInfo.failedStage,
    errorType: result.errorType,
    fixable: result.fixable,
    suggestedFix: result.suggestedFix,
    affectedFiles: result.affectedFiles || [],
    fullReport: result.fullReport,
  };
}

/**
 * Gather relevant source files for investigation
 */
async function gatherRelevantSourceFiles(failedStage: string): Promise<string> {
  const stageFileMap: Record<string, string[]> = {
    plan: ['AIDeveloper/src/agents/plan-agent.ts', 'AIDeveloper/src/utils/plan-chunker.ts'],
    code: ['AIDeveloper/src/agents/code-agent.ts', 'AIDeveloper/src/utils/plan-chunker.ts'],
    security_lint: ['AIDeveloper/src/agents/security-lint-agent.ts'],
    test: ['AIDeveloper/src/agents/test-agent.ts'],
    review: ['AIDeveloper/src/agents/review-agent.ts'],
    document: ['AIDeveloper/src/agents/document-agent.ts'],
  };

  const files = stageFileMap[failedStage] || [];
  let sourceContent = '';

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      sourceContent += `\n\n=== ${file} ===\n${content}`;
    } catch (error) {
      // File might not exist, skip
    }
  }

  return sourceContent;
}

/**
 * Generate and apply the fix
 */
async function generateAndApplyFix(investigation: InvestigationResult): Promise<FixResult> {
  if (!investigation.suggestedFix || !investigation.affectedFiles) {
    return {
      success: false,
      filesModified: [],
      error: 'No fix suggestion provided',
    };
  }

  // Use AI to generate the actual code changes
  const fixPrompt = `You are tasked with fixing a bug in the codebase.

## Bug Information
- Root Cause: ${investigation.rootCause}
- Error Type: ${investigation.errorType}
- Failed Stage: ${investigation.failedStage}

## Suggested Fix
${investigation.suggestedFix}

## Files to Modify
${investigation.affectedFiles.join('\n')}

Please provide the exact file changes needed. For each file, read the current content and provide the complete fixed version.

Respond in JSON format:
{
  "files": [
    {
      "path": "AIDeveloper/src/file.ts",
      "content": "complete file content with fix applied"
    }
  ]
}`;

  // Read current file contents
  let sourceFiles = '';
  for (const file of investigation.affectedFiles) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      sourceFiles += `\n\n=== ${file} ===\n${content}`;
    } catch (error) {
      console.warn(`Could not read file: ${file}`);
    }
  }

  const fullPrompt = `${fixPrompt}\n\n## Current File Contents\n${sourceFiles}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    messages: [
      {
        role: 'user',
        content: fullPrompt,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  // Parse JSON response
  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in fix response');
  }

  const fixData = JSON.parse(jsonMatch[0]);

  // Apply fixes to files
  const filesModified: string[] = [];
  for (const file of fixData.files) {
    await fs.writeFile(file.path, file.content, 'utf-8');
    filesModified.push(file.path);
    console.log(`   - Modified: ${file.path}`);
  }

  return {
    success: true,
    filesModified,
  };
}

/**
 * Commit and push the fix to develop branch
 */
async function commitAndPushFix(
  investigation: InvestigationResult,
  fixResult: FixResult
): Promise<void> {
  const commitMessage = `fix: auto-fix workflow ${investigation.workflowId} - ${investigation.rootCause}

This fix was automatically generated by the auto-fix-workflow system.

Root Cause: ${investigation.rootCause}
Failed Stage: ${investigation.failedStage}
Error Type: ${investigation.errorType}

Files modified:
${fixResult.filesModified.map(f => `- ${f}`).join('\n')}

🤖 Generated with Auto-Fix System`;

  // Ensure we're on develop branch
  await execAsync('git checkout develop');

  // Add modified files
  await execAsync(`git add ${fixResult.filesModified.join(' ')}`);

  // Commit
  await execAsync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`);

  // Push to remote
  await execAsync('git push origin develop');

  // Get commit hash
  const commitHash = (await execAsync('git rev-parse HEAD')).stdout.trim();
  fixResult.commitHash = commitHash.substring(0, 7);
}

/**
 * Trigger rebuild and restart of the system
 */
async function triggerRebuildRestart(): Promise<void> {
  try {
    const axios = (await import('axios')).default;
    await axios.post('http://localhost:3000/api/system/rebuild-restart');
  } catch (error: any) {
    // Expect connection to be lost as server restarts
    if (error.code !== 'ECONNRESET' && error.code !== 'ECONNREFUSED') {
      throw error;
    }
  }
}

/**
 * Create a new workflow with the original parameters
 */
async function createNewWorkflow(originalWorkflow: WorkflowInfo): Promise<number> {
  // Wait a bit more to ensure server is fully back
  console.log('   Waiting for server to be fully ready...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  const axios = (await import('axios')).default;

  // Retry logic in case server is still starting up
  let retries = 5;
  while (retries > 0) {
    try {
      const response = await axios.post('http://localhost:3000/api/workflows/manual', {
        workflowType: originalWorkflow.workflowType,
        taskDescription: originalWorkflow.taskDescription,
      });

      return response.data.workflowId;
    } catch (error: any) {
      retries--;
      if (retries === 0) throw error;
      console.log(`   Server not ready, retrying... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  throw new Error('Failed to create new workflow after multiple retries');
}

// Main execution
const workflowId = parseInt(process.argv[2]);

if (!workflowId || isNaN(workflowId)) {
  console.error('Usage: tsx auto-fix-workflow.ts <workflow-id>');
  process.exit(1);
}

autoFixWorkflow(workflowId)
  .then(() => {
    console.log('\n✅ Auto-fix completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Auto-fix failed:', error);
    process.exit(1);
  });
