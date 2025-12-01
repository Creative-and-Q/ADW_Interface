#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import readline from 'readline';
import {
  simpleQuery,
  query,
  collectQueryResponse,
  ClaudeSDKClient,
  createSession,
  safeQuery,
  extractText,
  extractToolUses,
  generateShortId,
  ClaudeCodeOptions,
  Message,
  AssistantMessage,
  ResultMessage,
} from './adw_modules/agent_sdk.js';

interface ProgramOptions {
  interactive: boolean;
  model: 'sonnet' | 'opus';
  workingDir?: string;
  tools?: string;
  context?: string;
  sessionId?: string;
}

const modelMap: Record<string, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
};

const displayOneShotInputs = (
  adwId: string,
  prompt: string,
  model: string,
  workingDir: string,
  allowedTools?: string[],
  sessionId?: string
): void => {
  console.log(chalk.blue.bold('\n🚀 SDK Query Execution\n'));
  
  const table = new Table({
    chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    style: { 'padding-left': 1, 'padding-right': 1 },
  });
  
  table.push(
    [chalk.cyan.bold('ADW ID'), adwId],
    [chalk.cyan.bold('Mode'), 'One-shot Query'],
    [chalk.cyan.bold('Prompt'), prompt],
    [chalk.cyan.bold('Model'), model],
    [chalk.cyan.bold('Working Dir'), workingDir]
  );
  
  if (allowedTools) table.push([chalk.cyan.bold('Tools'), allowedTools.join(', ')]);
  if (sessionId) table.push([chalk.cyan.bold('Session ID'), sessionId]);
  
  table.push([chalk.green.bold('SDK'), 'Claude Code TypeScript SDK']);
  
  console.log(table.toString());
  console.log();
};

const displayInteractiveInputs = (
  adwId: string,
  model: string,
  workingDir: string,
  context?: string,
  sessionId?: string
): void => {
  console.log(chalk.blue.bold('\n💬 SDK Interactive Session\n'));
  
  const table = new Table({
    chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    style: { 'padding-left': 1, 'padding-right': 1 },
  });
  
  table.push(
    [chalk.cyan.bold('ADW ID'), adwId],
    [chalk.cyan.bold('Mode'), 'Interactive Session'],
    [chalk.cyan.bold('Model'), model],
    [chalk.cyan.bold('Working Dir'), workingDir]
  );
  
  if (context) table.push([chalk.cyan.bold('Context'), context]);
  if (sessionId) table.push([chalk.cyan.bold('Session ID'), sessionId]);
  
  table.push([chalk.green.bold('SDK'), 'Claude Code TypeScript SDK']);
  
  console.log(table.toString());
  console.log();
};

const runOneShotQuery = async (
  prompt: string,
  model: string,
  workingDir: string,
  allowedTools?: string[],
  sessionId?: string
): Promise<void> => {
  const adwId = generateShortId();
  
  displayOneShotInputs(adwId, prompt, model, workingDir, allowedTools, sessionId);
  
  const spinner = ora('Executing via SDK...').start();
  
  try {
    let responseText = '';
    let toolUses: string[] = [];
    let success = false;
    
    if (allowedTools) {
      const options: ClaudeCodeOptions = {
        model,
        allowedTools,
        cwd: workingDir,
        permissionMode: 'bypassPermissions',
      };
      if (sessionId) options.resume = sessionId;
      
      const [messages, result, err] = await collectQueryResponse(prompt, options);
      
      if (err) {
        responseText = err.message;
        success = false;
      } else {
        for (const msg of messages) {
          if (msg.type === 'assistant') {
            const text = extractText(msg);
            if (text) responseText += text + '\n';
            for (const tool of extractToolUses(msg)) {
              toolUses.push(`${tool.name} (${tool.id.substring(0, 8)}...)`);
            }
          }
        }
        success = result ? !result.is_error : false;
      }
    } else {
      const [response, err] = await safeQuery(prompt);
      if (err) {
        responseText = err;
        success = false;
      } else {
        responseText = response || '';
        success = true;
      }
    }
    
    spinner.stop();
    
    if (success) {
      console.log(chalk.green.bold('\n✅ SDK Success\n'));
      console.log(responseText.trim());
      if (toolUses.length > 0) {
        console.log(chalk.cyan.bold('\nTools used: ') + toolUses.join(', '));
      }
    } else {
      console.log(chalk.red.bold('\n❌ SDK Error\n'));
      console.log(responseText);
    }
  } catch (err) {
    spinner.stop();
    console.log(chalk.red.bold('\n❌ Unexpected Error\n'));
    console.log(chalk.red((err as Error).message));
  }
};

const runInteractiveSession = async (
  model: string,
  workingDir: string,
  context?: string,
  sessionId?: string
): Promise<void> => {
  const adwId = generateShortId();
  
  displayInteractiveInputs(adwId, model, workingDir, context, sessionId);
  
  console.log(chalk.yellow.bold('Interactive Mode'));
  console.log("Commands: 'exit' or 'quit' to end session");
  console.log('Just type your questions or requests\n');
  
  const options: ClaudeCodeOptions = {
    model,
    cwd: workingDir,
    permissionMode: 'bypassPermissions',
  };
  if (sessionId) options.resume = sessionId;
  
  const [client, err] = await createSession(model, workingDir);
  if (err) {
    console.log(chalk.red.bold('\n❌ Failed to create session\n'));
    console.log(chalk.red(err.message));
    return;
  }
  
  let sessionIdFromResult: string | undefined;
  
  try {
    if (context) {
      console.log(chalk.dim(`Setting context: ${context}\n`));
      await client.query(`Context: ${context}`);
      
      for await (const msg of client.receiveResponse()) {
        if (msg.type === 'assistant') {
          const text = extractText(msg);
          if (text) console.log(chalk.dim(`Claude: ${text}\n`));
        }
      }
    }
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    const askQuestion = (): Promise<string> => {
      return new Promise((resolve) => {
        rl.question(chalk.cyan.bold('You: '), (answer) => {
          resolve(answer);
        });
      });
    };
    
    while (true) {
      const userInput = await askQuestion();
      
      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') break;
      
      await client.query(userInput);
      
      console.log();
      const responseParts: string[] = [];
      const toolUses: string[] = [];
      let cost: number | undefined;
      
      for await (const msg of client.receiveResponse()) {
        if (msg.type === 'assistant') {
          const text = extractText(msg);
          if (text) responseParts.push(text);
          
          for (const tool of extractToolUses(msg)) {
            toolUses.push(tool.name);
          }
        } else if (msg.type === 'result') {
          if (msg.total_cost_usd) cost = msg.total_cost_usd;
          if (msg.session_id) sessionIdFromResult = msg.session_id;
        }
      }
      
      if (responseParts.length > 0) {
        console.log(chalk.green.bold('Claude:'));
        for (const part of responseParts) {
          console.log(part);
        }
      }
      
      if (toolUses.length > 0) {
        console.log(chalk.dim(`\nTools used: ${toolUses.join(', ')}`));
      }
      
      if (cost !== undefined) {
        console.log(chalk.dim(`Cost: $${cost.toFixed(4)}`));
      }
      
      if (sessionIdFromResult) {
        console.log(chalk.dim(`Session ID: ${sessionIdFromResult}`));
      }
      
      console.log();
    }
    
    rl.close();
  } finally {
    await client.disconnect();
  }
  
  console.log(chalk.green.bold('\nSession ended'));
  console.log(chalk.dim(`ADW ID: ${adwId}`));
  if (sessionIdFromResult) {
    console.log(chalk.cyan.bold('Session ID: ') + sessionIdFromResult);
    console.log(chalk.dim(`Resume with: ./adws/adw_sdk_prompt.ts --interactive --session-id ${sessionIdFromResult}`));
  }
};

const main = async (): Promise<void> => {
  const program = new Command();
  
  program
    .name('adw_sdk_prompt')
    .description('Run Claude Code prompts using the Python SDK')
    .argument('[prompt]', 'The prompt to execute (required for one-shot mode)')
    .option('-i, --interactive', 'Start an interactive session instead of one-shot query')
    .option('--model <model>', 'Claude model to use (sonnet or opus)', 'sonnet')
    .option('--working-dir <path>', 'Working directory')
    .option('--tools <tools>', 'Comma-separated list of allowed tools')
    .option('--context <context>', 'Context for interactive session')
    .option('--session-id <id>', 'Resume a previous session by its ID')
    .parse();
  
  const prompt = program.args[0];
  const options = program.opts<ProgramOptions>();
  
  const workingDir = options.workingDir || process.cwd();
  const fullModel = modelMap[options.model] || options.model;
  
  const allowedTools = options.tools ? options.tools.split(',').map(t => t.trim()) : undefined;
  
  if (options.interactive) {
    if (prompt) {
      console.log(chalk.yellow('Warning: Prompt ignored in interactive mode\n'));
    }
    
    await runInteractiveSession(fullModel, workingDir, options.context, options.sessionId);
  } else {
    if (!prompt) {
      console.log(chalk.red('Error: Prompt required for one-shot mode'));
      console.log('Use --interactive for interactive session');
      process.exit(1);
    }
    
    await runOneShotQuery(prompt, fullModel, workingDir, allowedTools, options.sessionId);
  }
};

main();

