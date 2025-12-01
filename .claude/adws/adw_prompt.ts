#!/usr/bin/env node

import { Command } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import {
  promptClaudeCode,
  promptClaudeCodeWithRetry,
  generateShortId,
  AgentPromptRequest,
  AgentPromptResponse,
  OUTPUT_JSONL,
  OUTPUT_JSON,
  FINAL_OBJECT_JSON,
  SUMMARY_JSON,
} from './adw_modules/agent.js';

interface ProgramOptions {
  model: 'sonnet' | 'opus';
  output?: string;
  workingDir?: string;
  noRetry: boolean;
  agentName: string;
}

const displayInputs = (adwId: string, prompt: string, model: string, workingDir: string, outputPath: string): void => {
  console.log(chalk.blue.bold('\n🚀 Inputs\n'));
  
  const table = new Table({
    chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    style: { 'padding-left': 1, 'padding-right': 1 },
  });
  
  table.push(
    [chalk.cyan.bold('ADW ID'), adwId],
    [chalk.cyan.bold('ADW Name'), 'adw_prompt'],
    [chalk.cyan.bold('Prompt'), prompt],
    [chalk.cyan.bold('Model'), model],
    [chalk.cyan.bold('Working Dir'), workingDir],
    [chalk.cyan.bold('Output'), outputPath]
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

const displayOutputFiles = (outputPath: string, summaryPath: string): void => {
  console.log();
  console.log(chalk.blue.bold('📄 Output Files\n'));
  
  const outputDir = path.dirname(outputPath);
  const jsonArrayPath = path.join(outputDir, OUTPUT_JSON);
  const finalObjectPath = path.join(outputDir, FINAL_OBJECT_JSON);
  
  const table = new Table({
    head: [chalk.cyan.bold('File Type'), chalk.dim('Path'), chalk.italic('Description')],
    style: { head: [], border: [] },
  });
  
  table.push(
    ['JSONL Stream', chalk.dim(outputPath), chalk.italic('Raw streaming output from Claude Code')],
    ['JSON Array', chalk.dim(jsonArrayPath), chalk.italic('All messages as a JSON array')],
    ['Final Object', chalk.dim(finalObjectPath), chalk.italic('Last message entry (final result)')],
    ['Summary', chalk.dim(summaryPath), chalk.italic('High-level execution summary with metadata')]
  );
  
  console.log(table.toString());
};

const main = async (): Promise<void> => {
  const program = new Command();
  
  program
    .name('adw_prompt')
    .description('Run an adhoc Claude Code prompt from the command line')
    .argument('<prompt>', 'The prompt to execute')
    .option('--model <model>', 'Claude model to use (sonnet or opus)', 'sonnet')
    .option('--output <path>', 'Output file path')
    .option('--working-dir <path>', 'Working directory for the prompt execution')
    .option('--no-retry', 'Disable automatic retry on failure')
    .option('--agent-name <name>', 'Agent name for tracking', 'oneoff')
    .parse();
  
  const prompt = program.args[0];
  const options = program.opts<ProgramOptions>();
  
  const adwId = generateShortId();
  
  let outputPath: string;
  if (options.output) {
    outputPath = options.output;
  } else {
    const outputDir = path.join(process.cwd(), 'agents', adwId, options.agentName);
    await fs.mkdir(outputDir, { recursive: true });
    outputPath = path.join(outputDir, OUTPUT_JSONL);
  }
  
  const workingDir = options.workingDir || process.cwd();
  
  const request: AgentPromptRequest = {
    prompt,
    adwId,
    agentName: options.agentName,
    model: options.model,
    dangerouslySkipPermissions: true,
    outputFile: outputPath,
    workingDir,
  };
  
  displayInputs(adwId, prompt, options.model, workingDir, outputPath);
  
  const spinner = ora('Executing prompt...').start();
  
  let response: AgentPromptResponse;
  try {
    if (options.noRetry) {
      response = await promptClaudeCode(request);
    } else {
      response = await promptClaudeCodeWithRetry(request);
    }
    
    spinner.stop();
    displayResult(response);
    
    const summaryPath = outputPath.endsWith(`/${OUTPUT_JSONL}`)
      ? outputPath.replace(`/${OUTPUT_JSONL}`, `/${SUMMARY_JSON}`)
      : outputPath.replace('.jsonl', '_summary.json');
    
    await fs.writeFile(
      summaryPath,
      JSON.stringify(
        {
          adwId,
          prompt,
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
    
    displayOutputFiles(outputPath, summaryPath);
    
    process.exit(response.success ? 0 : 1);
  } catch (err) {
    spinner.stop();
    console.log(chalk.red.bold('\n❌ Unexpected Error\n'));
    console.log(chalk.red((err as Error).message));
    process.exit(2);
  }
};

main();

