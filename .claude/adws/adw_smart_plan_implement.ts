#!/usr/bin/env node

import { Command } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import {
  executeTemplate,
  generateShortId,
  AgentTemplateRequest,
  AgentPromptResponse,
  OUTPUT_JSONL,
  OUTPUT_JSON,
  FINAL_OBJECT_JSON,
  SUMMARY_JSON,
} from './adw_modules/agent.js';
import {
  safeQuery,
  extractText,
} from './adw_modules/agent_sdk.js';

interface ProgramOptions {
  model: 'sonnet' | 'opus';
  workingDir?: string;
  forceType?: 'bug' | 'chore' | 'feature';
}

type RequestType = 'bug' | 'chore' | 'feature';

const extractPlanPath = (output: string): [string | null, Error | null] => {
  const patterns = [
    /specs?\/(?:bug|chore|feature)-[a-zA-Z0-9\-]+\.md/,
    /\.specs?\/(?:bug|chore|feature)-[a-zA-Z0-9\-]+\.md/,
    /Created plan at:\s*(\.?specs?\/(?:bug|chore|feature)-[a-zA-Z0-9\-]+\.md)/,
    /Plan file:\s*(\.?specs?\/(?:bug|chore|feature)-[a-zA-Z0-9\-]+\.md)/,
    /path.*?:\s*(\.?specs?\/(?:bug|chore|feature)-[a-zA-Z0-9\-]+\.md)/i,
  ];
  
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) return [match[1] || match[0], null];
  }
  
  return [null, new Error('Could not find plan file path in output')];
};

const classifyRequest = async (description: string): Promise<[RequestType | null, Error | null]> => {
  const classificationPrompt = `You are a technical project manager. Classify this request as either "bug", "chore", or "feature".

Rules:
- "bug": Something is broken, not working as expected, or producing errors
- "chore": Maintenance, refactoring, cleanup, documentation, or infrastructure work
- "feature": New functionality, enhancement, or capability

Request: "${description}"

Respond with ONLY one word: bug, chore, or feature`;

  const [response, err] = await safeQuery(classificationPrompt);
  
  if (err) return [null, new Error(`Classification failed: ${err}`)];
  if (!response) return [null, new Error('No classification response received')];
  
  const classification = response.trim().toLowerCase();
  
  if (classification.includes('bug')) return ['bug', null];
  if (classification.includes('chore')) return ['chore', null];
  if (classification.includes('feature')) return ['feature', null];
  
  return [null, new Error(`Invalid classification: ${classification}`)];
};

const displayWorkflowConfig = (
  adwId: string,
  requestType: RequestType,
  description: string,
  model: string,
  workingDir: string,
  forced: boolean
): void => {
  console.log(chalk.blue.bold('\n🚀 Smart Plan & Implement Workflow\n'));
  
  const table = new Table({
    chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    style: { 'padding-left': 1, 'padding-right': 1 },
  });
  
  table.push(
    [chalk.cyan.bold('ADW ID'), adwId],
    [chalk.cyan.bold('Request Type'), chalk[requestType === 'bug' ? 'red' : requestType === 'chore' ? 'yellow' : 'green'](requestType.toUpperCase()) + (forced ? ' (forced)' : ' (auto-detected)')],
    [chalk.cyan.bold('Description'), description],
    [chalk.cyan.bold('Model'), model],
    [chalk.cyan.bold('Working Dir'), workingDir]
  );
  
  console.log(table.toString());
  console.log();
};

const displayPhaseInputs = (
  phase: string,
  adwId: string,
  command: string,
  args: string,
  model: string,
  agent: string
): void => {
  console.log(chalk.blue.bold(`\n🚀 ${phase} Inputs\n`));
  
  const table = new Table({
    chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    style: { 'padding-left': 1, 'padding-right': 1 },
  });
  
  table.push(
    [chalk.cyan.bold('ADW ID'), adwId],
    [chalk.cyan.bold('Command'), command],
    [chalk.cyan.bold('Args'), args],
    [chalk.cyan.bold('Model'), model],
    [chalk.cyan.bold('Agent'), agent]
  );
  
  console.log(table.toString());
  console.log();
};

const displayPhaseResult = (phase: string, response: AgentPromptResponse): void => {
  if (response.success) {
    console.log(chalk.green.bold(`\n✅ ${phase} Success\n`));
    console.log(response.output);
  } else {
    console.log(chalk.red.bold(`\n❌ ${phase} Failed\n`));
    console.log(response.output);
  }
};

const displayPhaseFiles = (phase: string, outputDir: string, summaryPath: string): void => {
  console.log();
  console.log(chalk.blue.bold(`📄 ${phase} Output Files\n`));
  
  const table = new Table({
    head: [chalk.cyan.bold('File Type'), chalk.dim('Path'), chalk.italic('Description')],
    style: { head: [], border: [] },
  });
  
  table.push(
    ['JSONL Stream', chalk.dim(`${outputDir}/${OUTPUT_JSONL}`), chalk.italic('Raw streaming output from Claude Code')],
    ['JSON Array', chalk.dim(`${outputDir}/${OUTPUT_JSON}`), chalk.italic('All messages as a JSON array')],
    ['Final Object', chalk.dim(`${outputDir}/${FINAL_OBJECT_JSON}`), chalk.italic('Last message entry (final result)')],
    ['Summary', chalk.dim(summaryPath), chalk.italic('High-level execution summary with metadata')]
  );
  
  console.log(table.toString());
};

const displayWorkflowSummary = (
  adwId: string,
  requestType: RequestType,
  plannerName: string,
  builderName: string,
  planningResponse: AgentPromptResponse,
  implementResponse: AgentPromptResponse
): void => {
  console.log();
  console.log('─'.repeat(60));
  console.log(chalk.blue.bold('Workflow Summary'));
  console.log('─'.repeat(60));
  console.log();
  
  const table = new Table({
    head: [chalk.cyan.bold('Phase'), chalk.bold('Status'), chalk.dim('Output Directory')],
    style: { head: [], border: [] },
  });
  
  const planningStatus = planningResponse.success ? '✅ Success' : '❌ Failed';
  const implementStatus = implementResponse.success ? '✅ Success' : '❌ Failed';
  
  table.push(
    [`Classification`, '✅ Success', chalk.dim(requestType.toUpperCase())],
    [`Planning (/${requestType})`, planningStatus, chalk.dim(`./.claude/agents/${adwId}/${plannerName}/`)],
    [`Implementation (/implement)`, implementStatus, chalk.dim(`./.claude/agents/${adwId}/${builderName}/`)]
  );
  
  console.log(table.toString());
};

const main = async (): Promise<void> => {
  const program = new Command();
  
  program
    .name('adw_smart_plan_implement')
    .description('Intelligently classify and execute planning + implementation workflow')
    .argument('<description>', 'The request description (bug/chore/feature)')
    .option('--model <model>', 'Claude model to use (sonnet or opus)', 'sonnet')
    .option('--working-dir <path>', 'Working directory for command execution')
    .option('--force-type <type>', 'Force classification as bug, chore, or feature (skips AI classification)')
    .parse();
  
  const description = program.args[0];
  const options = program.opts<ProgramOptions>();
  
  const adwId = generateShortId();
  const workingDir = options.workingDir || process.cwd();
  const plannerName = 'planner';
  const builderName = 'builder';
  
  let requestType: RequestType;
  let forced = false;
  
  if (options.forceType) {
    requestType = options.forceType;
    forced = true;
    console.log(chalk.yellow('\n⚠️  Classification forced by user\n'));
  } else {
    console.log('─'.repeat(60));
    console.log(chalk.yellow.bold('Phase 0: Classification'));
    console.log('─'.repeat(60));
    console.log();
    
    const spinner = ora('Classifying request...').start();
    const [classifiedType, classifyErr] = await classifyRequest(description);
    spinner.stop();
    
    if (classifyErr || !classifiedType) {
      console.log(chalk.red.bold('\n❌ Classification Failed\n'));
      console.log(chalk.red((classifyErr?.message || 'Unknown error')));
      process.exit(1);
    }
    
    requestType = classifiedType;
    console.log(chalk.green.bold('\n✅ Classification Complete\n'));
    console.log(chalk.cyan('Type: ') + chalk.bold(requestType.toUpperCase()));
  }
  
  displayWorkflowConfig(adwId, requestType, description, options.model, workingDir, forced);
  
  console.log('─'.repeat(60));
  console.log(chalk.yellow.bold(`Phase 1: Planning (/${requestType})`));
  console.log('─'.repeat(60));
  console.log();
  
  const commandArgs = requestType === 'feature' ? [adwId, description] : [description];
  
  const planningRequest: AgentTemplateRequest = {
    agentName: plannerName,
    slashCommand: `/${requestType}`,
    args: commandArgs,
    adwId,
    model: options.model,
    workingDir,
  };
  
  displayPhaseInputs(
    'Planning',
    adwId,
    `/${requestType}`,
    commandArgs.join(' '),
    options.model,
    plannerName
  );
  
  let planPath: string | null = null;
  let planningResponse: AgentPromptResponse;
  let implementResponse: AgentPromptResponse | null = null;
  
  try {
    const spinner = ora(`Creating ${requestType} plan...`).start();
    planningResponse = await executeTemplate(planningRequest);
    spinner.stop();
    
    displayPhaseResult('Planning', planningResponse);
    
    if (planningResponse.success) {
      const [extractedPath, extractErr] = extractPlanPath(planningResponse.output);
      
      if (extractErr) {
        console.log(chalk.red.bold('\n❌ Parse Error\n'));
        console.log(chalk.red('Could not extract plan path: ' + extractErr.message));
        console.log('The planning command succeeded but the plan file path could not be found in the output.');
        process.exit(3);
      }
      
      planPath = extractedPath;
      console.log(chalk.cyan.bold('\nPlan created at: ') + planPath);
    } else {
      console.log(chalk.red.bold('\nWorkflow aborted: Planning phase failed'));
      process.exit(1);
    }
    
    const planningOutputDir = `./.claude/agents/${adwId}/${plannerName}`;
    const planningSummaryPath = `${planningOutputDir}/${SUMMARY_JSON}`;
    
    await fs.writeFile(
      planningSummaryPath,
      JSON.stringify(
        {
          phase: 'planning',
          requestType,
          adwId,
          slashCommand: `/${requestType}`,
          args: commandArgs,
          pathToSlashCommandPrompt: `.claude/commands/${requestType}.md`,
          model: options.model,
          workingDir,
          success: planningResponse.success,
          sessionId: planningResponse.sessionId,
          retryCode: planningResponse.retryCode,
          output: planningResponse.output,
          planPath,
        },
        null,
        2
      )
    );
    
    displayPhaseFiles('Planning', planningOutputDir, planningSummaryPath);
    
    console.log();
    console.log('─'.repeat(60));
    console.log(chalk.yellow.bold('Phase 2: Implementation (/implement)'));
    console.log('─'.repeat(60));
    console.log();
    
    const implementRequest: AgentTemplateRequest = {
      agentName: builderName,
      slashCommand: '/implement',
      args: [planPath!],
      adwId,
      model: options.model,
      workingDir,
    };
    
    displayPhaseInputs('Implement', adwId, '/implement', planPath!, options.model, builderName);
    
    const implementSpinner = ora('Implementing plan...').start();
    implementResponse = await executeTemplate(implementRequest);
    implementSpinner.stop();
    
    displayPhaseResult('Implementation', implementResponse);
    
    if (implementResponse.sessionId) {
      console.log(chalk.cyan.bold('\nSession ID: ') + implementResponse.sessionId);
    }
    
    const implementOutputDir = `./.claude/agents/${adwId}/${builderName}`;
    const implementSummaryPath = `${implementOutputDir}/${SUMMARY_JSON}`;
    
    await fs.writeFile(
      implementSummaryPath,
      JSON.stringify(
        {
          phase: 'implementation',
          adwId,
          slashCommand: '/implement',
          args: [planPath],
          pathToSlashCommandPrompt: '.claude/commands/implement.md',
          model: options.model,
          workingDir,
          success: implementResponse.success,
          sessionId: implementResponse.sessionId,
          retryCode: implementResponse.retryCode,
          output: implementResponse.output,
        },
        null,
        2
      )
    );
    
    displayPhaseFiles('Implementation', implementOutputDir, implementSummaryPath);
    
    displayWorkflowSummary(adwId, requestType, plannerName, builderName, planningResponse, implementResponse);
    
    const workflowSummaryPath = `./.claude/agents/${adwId}/workflow_summary.json`;
    await fs.mkdir(`./.claude/agents/${adwId}`, { recursive: true });
    
    await fs.writeFile(
      workflowSummaryPath,
      JSON.stringify(
        {
          workflow: 'smart_plan_implement',
          requestType,
          adwId,
          description,
          model: options.model,
          workingDir,
          planPath,
          phases: {
            classification: {
              success: true,
              type: requestType,
              forced,
            },
            planning: {
              success: planningResponse.success,
              sessionId: planningResponse.sessionId,
              agent: plannerName,
              outputDir: `./.claude/agents/${adwId}/${plannerName}/`,
              command: `/${requestType}`,
            },
            implementation: {
              success: implementResponse.success,
              sessionId: implementResponse.sessionId,
              agent: builderName,
              outputDir: `./.claude/agents/${adwId}/${builderName}/`,
            },
          },
          overallSuccess: planningResponse.success && implementResponse.success,
        },
        null,
        2
      )
    );
    
    console.log(chalk.cyan.bold('\nWorkflow summary: ') + workflowSummaryPath);
    console.log();
    
    if (planningResponse.success && implementResponse.success) {
      console.log(chalk.green.bold('✅ Workflow completed successfully!'));
      process.exit(0);
    } else {
      console.log(chalk.yellow.bold('⚠️  Workflow completed with errors'));
      process.exit(1);
    }
  } catch (err) {
    console.log(chalk.red.bold('\n❌ Unexpected Error\n'));
    console.log(chalk.red((err as Error).message));
    process.exit(2);
  }
};

main();

