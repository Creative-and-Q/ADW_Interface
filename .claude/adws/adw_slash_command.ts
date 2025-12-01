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
  agentName: string;
}

const displayInputs = (
  adwId: string,
  slashCommand: string,
  args: string[],
  model: string,
  workingDir: string
): void => {
  console.log(chalk.blue.bold('\n🚀 Inputs\n'));
  
  const table = new Table({
    chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    style: { 'padding-left': 1, 'padding-right': 1 },
  });
  
  table.push(
    [chalk.cyan.bold('ADW ID'), adwId],
    [chalk.cyan.bold('ADW Name'), 'adw_slash_command'],
    [chalk.cyan.bold('Command'), slashCommand],
    [chalk.cyan.bold('Args'), args.length > 0 ? args.join(' ') : '(none)'],
    [chalk.cyan.bold('Model'), model],
    [chalk.cyan.bold('Working Dir'), workingDir]
  );
  
  console.log(table.toString());
  console.log();
};

const displayResult = (response: AgentPromptResponse): void => {
  if (response.success) {
    console.log(chalk.green.bold('\n✅ Success\n'));
    console.log(response.output);
    if (response.sessionId) {
      console.log(chalk.cyan.bold('\nSession ID: ') + response.sessionId);
    }
  } else {
    console.log(chalk.red.bold('\n❌ Failed\n'));
    console.log(response.output);
    if (response.retryCode !== 'none') {
      console.log(chalk.yellow.bold('\nRetry code: ') + response.retryCode);
    }
  }
};

const displayOutputFiles = (outputDir: string, summaryPath: string): void => {
  console.log();
  console.log(chalk.blue.bold('📄 Output Files\n'));
  
  const jsonlPath = path.join(outputDir, OUTPUT_JSONL);
  const jsonArrayPath = path.join(outputDir, OUTPUT_JSON);
  const finalObjectPath = path.join(outputDir, FINAL_OBJECT_JSON);
  
  const table = new Table({
    head: [chalk.cyan.bold('File Type'), chalk.dim('Path'), chalk.italic('Description')],
    style: { head: [], border: [] },
  });
  
  table.push(
    ['JSONL Stream', chalk.dim(jsonlPath), chalk.italic('Raw streaming output from Claude Code')],
    ['JSON Array', chalk.dim(jsonArrayPath), chalk.italic('All messages as a JSON array')],
    ['Final Object', chalk.dim(finalObjectPath), chalk.italic('Last message entry (final result)')],
    ['Summary', chalk.dim(summaryPath), chalk.italic('High-level execution summary with metadata')]
  );
  
  console.log(table.toString());
};

const main = async (): Promise<void> => {
  const program = new Command();
  
  program
    .name('adw_slash_command')
    .description('Run Claude Code slash commands from the command line')
    .argument('<slash_command>', 'The slash command to execute')
    .argument('[args...]', 'Arguments for the slash command')
    .option('--model <model>', 'Claude model to use (sonnet or opus)', 'sonnet')
    .option('--working-dir <path>', 'Working directory for command execution')
    .option('--agent-name <name>', 'Agent name for tracking', 'executor')
    .parse();
  
  const slashCommand = program.args[0];
  const args = program.args.slice(1);
  const options = program.opts<ProgramOptions>();
  
  const adwId = generateShortId();
  const workingDir = options.workingDir || process.cwd();
  
  const request: AgentTemplateRequest = {
    agentName: options.agentName,
    slashCommand,
    args,
    adwId,
    model: options.model,
    workingDir,
  };
  
  displayInputs(adwId, slashCommand, args, options.model, workingDir);
  
  const spinner = ora('Executing command...').start();
  
  try {
    const response = await executeTemplate(request);
    
    spinner.stop();
    displayResult(response);
    
    const outputDir = path.join(process.cwd(), 'agents', adwId, options.agentName);
    const summaryPath = path.join(outputDir, SUMMARY_JSON);
    
    const commandName = slashCommand.replace(/^\//, '');
    const pathToSlashCommandPrompt = `.claude/commands/${commandName}.md`;
    
    await fs.writeFile(
      summaryPath,
      JSON.stringify(
        {
          adwId,
          slashCommand,
          args,
          pathToSlashCommandPrompt,
          model: options.model,
          workingDir,
          success: response.success,
          sessionId: response.sessionId,
          retryCode: response.retryCode,
          output: response.output,
        },
        null,
        2
      )
    );
    
    displayOutputFiles(outputDir, summaryPath);
    
    process.exit(response.success ? 0 : 1);
  } catch (err) {
    spinner.stop();
    console.log(chalk.red.bold('\n❌ Unexpected Error\n'));
    console.log(chalk.red((err as Error).message));
    process.exit(2);
  }
};

main();

