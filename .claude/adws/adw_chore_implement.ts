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

interface ProgramOptions {
  model: 'sonnet' | 'opus';
  workingDir?: string;
}

const extractPlanPath = (output: string): [string | null, Error | null] => {
  const patterns = [
    /specs\/chore-[a-zA-Z0-9\-]+\.md/,
    /Created plan at:\s*(specs\/chore-[a-zA-Z0-9\-]+\.md)/,
    /Plan file:\s*(specs\/chore-[a-zA-Z0-9\-]+\.md)/,
    /path.*?:\s*(specs\/chore-[a-zA-Z0-9\-]+\.md)/i,
  ];
  
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) return [match[1] || match[0], null];
  }
  
  return [null, new Error('Could not find plan file path in chore output')];
};

const displayWorkflowConfig = (adwId: string, model: string, workingDir: string): void => {
  console.log(chalk.blue.bold('\n🚀 Workflow Configuration\n'));
  console.log(chalk.bold.blue('ADW Chore & Implement Workflow\n'));
  console.log(chalk.cyan('ADW ID: ') + adwId);
  console.log(chalk.cyan('Model: ') + model);
  console.log(chalk.cyan('Working Dir: ') + workingDir);
  console.log();
};

const displayPhaseInputs = (
  phase: string,
  adwId: string,
  adwName: string,
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
    [chalk.cyan.bold('ADW Name'), adwName],
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
  plannerName: string,
  builderName: string,
  choreResponse: AgentPromptResponse,
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
  
  const planningStatus = choreResponse.success ? '✅ Success' : '❌ Failed';
  const implementStatus = implementResponse.success ? '✅ Success' : '❌ Failed';
  
  table.push(
    ['Planning (/chore)', planningStatus, chalk.dim(`./.claude/agents/${adwId}/${plannerName}/`)],
    ['Implementation (/implement)', implementStatus, chalk.dim(`./.claude/agents/${adwId}/${builderName}/`)]
  );
  
  console.log(table.toString());
};

const main = async (): Promise<void> => {
  const program = new Command();
  
  program
    .name('adw_chore_implement')
    .description('Run chore planning and implementation workflow')
    .argument('<prompt>', 'The chore prompt to execute')
    .option('--model <model>', 'Claude model to use (sonnet or opus)', 'sonnet')
    .option('--working-dir <path>', 'Working directory for command execution')
    .parse();
  
  const prompt = program.args[0];
  const options = program.opts<ProgramOptions>();
  
  const adwId = generateShortId();
  const workingDir = options.workingDir || process.cwd();
  const plannerName = 'planner';
  const builderName = 'builder';
  
  displayWorkflowConfig(adwId, options.model, workingDir);
  
  console.log('─'.repeat(60));
  console.log(chalk.yellow.bold('Phase 1: Planning (/chore)'));
  console.log('─'.repeat(60));
  console.log();
  
  const choreRequest: AgentTemplateRequest = {
    agentName: plannerName,
    slashCommand: '/chore',
    args: [adwId, prompt],
    adwId,
    model: options.model,
    workingDir,
  };
  
  displayPhaseInputs('Chore', adwId, 'adw_chore_implement (planning)', '/chore', `${adwId} "${prompt}"`, options.model, plannerName);
  
  let planPath: string | null = null;
  let choreResponse: AgentPromptResponse;
  let implementResponse: AgentPromptResponse | null = null;
  
  try {
    const spinner = ora('Creating plan...').start();
    choreResponse = await executeTemplate(choreRequest);
    spinner.stop();
    
    displayPhaseResult('Planning', choreResponse);
    
    if (choreResponse.success) {
      const [extractedPath, extractErr] = extractPlanPath(choreResponse.output);
      
      if (extractErr) {
        console.log(chalk.red.bold('\n❌ Parse Error\n'));
        console.log(chalk.red('Could not extract plan path: ' + extractErr.message));
        console.log('The chore command succeeded but the plan file path could not be found in the output.');
        process.exit(3);
      }
      
      planPath = extractedPath;
      console.log(chalk.cyan.bold('\nPlan created at: ') + planPath);
    } else {
      console.log(chalk.red.bold('\nWorkflow aborted: Planning phase failed'));
      process.exit(1);
    }
    
    const choreOutputDir = `./.claude/agents/${adwId}/${plannerName}`;
    const choreSummaryPath = `${choreOutputDir}/${SUMMARY_JSON}`;
    
    await fs.writeFile(
      choreSummaryPath,
      JSON.stringify(
        {
          phase: 'planning',
          adwId,
          slashCommand: '/chore',
          args: [adwId, prompt],
          pathToSlashCommandPrompt: '.claude/commands/chore.md',
          model: options.model,
          workingDir,
          success: choreResponse.success,
          sessionId: choreResponse.sessionId,
          retryCode: choreResponse.retryCode,
          output: choreResponse.output,
          planPath,
        },
        null,
        2
      )
    );
    
    displayPhaseFiles('Planning', choreOutputDir, choreSummaryPath);
    
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
    
    displayPhaseInputs('Implement', adwId, 'adw_chore_implement (building)', '/implement', planPath!, options.model, builderName);
    
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
    
    displayWorkflowSummary(adwId, plannerName, builderName, choreResponse, implementResponse);
    
    const workflowSummaryPath = `./.claude/agents/${adwId}/workflow_summary.json`;
    await fs.mkdir(`./.claude/agents/${adwId}`, { recursive: true });
    
    await fs.writeFile(
      workflowSummaryPath,
      JSON.stringify(
        {
          workflow: 'chore_implement',
          adwId,
          prompt,
          model: options.model,
          workingDir,
          planPath,
          phases: {
          planning: {
            success: choreResponse.success,
            sessionId: choreResponse.sessionId,
            agent: plannerName,
            outputDir: `./.claude/agents/${adwId}/${plannerName}/`,
          },
          implementation: {
            success: implementResponse.success,
            sessionId: implementResponse.sessionId,
            agent: builderName,
            outputDir: `./.claude/agents/${adwId}/${builderName}/`,
          },
          },
          overallSuccess: choreResponse.success && implementResponse.success,
        },
        null,
        2
      )
    );
    
    console.log(chalk.cyan.bold('\nWorkflow summary: ') + workflowSummaryPath);
    console.log();
    
    if (choreResponse.success && implementResponse.success) {
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

