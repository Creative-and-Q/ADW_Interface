#!/usr/bin/env node

import { Command } from 'commander';
import * as readline from 'readline';
import chalk from 'chalk';
import * as dotenv from 'dotenv';
import { IntentInterpreter } from './interpreter.js';
import { InterpretationResult, InterpreterError } from './types.js';

// Load environment variables
dotenv.config();

/**
 * Formats and displays an interpretation result as JSON
 * @param result - The interpretation result to display
 */
function displayResult(result: InterpretationResult): void {
  console.log(JSON.stringify(result, null, 2));
}

/**
 * Formats and displays an interpretation result with colors (for interactive mode)
 * @param result - The interpretation result to display
 */
function displayResultInteractive(result: InterpretationResult): void {
  if (result.error) {
    console.log(chalk.red('❌ Error:'), result.error);
  }

  // console log the raw message and the intents
  console.log(result.intents);
}

/**
 * Creates and configures the interpreter from environment variables
 * @returns Configured IntentInterpreter instance
 * @throws {Error} If required environment variables are missing
 */
function createInterpreter(): IntentInterpreter {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'xai/grok-2-1212';
  const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  const minConfidenceThreshold = parseFloat(process.env.MIN_CONFIDENCE_THRESHOLD || '0.3');
  const maxIntentsReturned = parseInt(process.env.MAX_INTENTS_RETURNED || '5', 10);

  if (!apiKey) {
    console.error(chalk.red('Error: OPENROUTER_API_KEY environment variable is required'));
    console.error(chalk.yellow('Please create a .env file based on .env.example'));
    process.exit(1);
  }

  try {
    return new IntentInterpreter(
      {
        apiKey,
        model,
        baseUrl,
      },
      {
        minConfidenceThreshold,
        maxIntentsReturned,
      }
    );
  } catch (error) {
    console.error(
      chalk.red('Error creating interpreter:'),
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

/**
 * Runs the CLI in interactive mode
 * Allows users to input multiple messages and see results
 */
async function runInteractiveMode(): Promise<void> {
  console.log(chalk.bold.cyan('\n🤖 Intent Interpreter - Interactive Mode\n'));
  console.log(chalk.gray('Type your messages and press Enter to interpret.'));
  console.log(chalk.gray('Commands: /quit, /exit, /q - Exit the program'));
  console.log(chalk.gray('          /help - Show this help message'));
  console.log(chalk.gray('          /config - Show current configuration'));
  console.log(chalk.gray('          /stats - Show cache statistics'));
  console.log(chalk.gray('          /clear-cache - Clear all cached entries\n'));

  const interpreter = createInterpreter();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green('> '),
  });

  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Handle commands
    if (input === '/quit' || input === '/exit' || input === '/q') {
      console.log(chalk.yellow('\nGoodbye! 👋\n'));
      rl.close();
      process.exit(0);
    }

    if (input === '/help') {
      console.log(chalk.cyan('\nAvailable Commands:'));
      console.log(chalk.gray('  /quit, /exit, /q - Exit the program'));
      console.log(chalk.gray('  /help - Show this help message'));
      console.log(chalk.gray('  /config - Show current configuration'));
      console.log(chalk.gray('  /stats - Show cache statistics'));
      console.log(chalk.gray('  /clear-cache - Clear all cached entries\n'));
      rl.prompt();
      return;
    }

    if (input === '/config') {
      console.log(chalk.cyan('\nCurrent Configuration:'));
      console.log(
        chalk.gray('  Interpreter:'),
        JSON.stringify(interpreter.getConfig(), null, 2)
      );
      console.log(
        chalk.gray('  OpenRouter:'),
        JSON.stringify(interpreter.getOpenRouterConfig(), null, 2)
      );
      console.log();
      rl.prompt();
      return;
    }

    if (input === '/stats') {
      const stats = interpreter.getCacheStats();
      console.log(chalk.cyan('\nCache Statistics:'));
      console.log(chalk.gray('  Hits:'), chalk.green(stats.hits.toString()));
      console.log(chalk.gray('  Misses:'), chalk.yellow(stats.misses.toString()));
      console.log(chalk.gray('  Hit Rate:'), chalk.blue(`${stats.hitRate.toFixed(2)}%`));
      console.log(chalk.gray('  Cache Size:'), stats.size.toString(), 'entries');
      console.log(chalk.gray('  Tokens Saved:'), chalk.green(`~${stats.tokensSaved || 0}`));
      console.log();
      rl.prompt();
      return;
    }

    if (input === '/clear-cache') {
      try {
        await interpreter.clearCache();
        console.log(chalk.green('\n✓ Cache cleared successfully\n'));
      } catch (error) {
        console.log(
          chalk.red('\n✗ Error clearing cache:'),
          error instanceof Error ? error.message : String(error)
        );
      }
      rl.prompt();
      return;
    }

    // Process message
    try {
      const result = await interpreter.interpret(input);
      displayResultInteractive(result);
    } catch (error) {
      console.error(
        chalk.red('Error:'),
        error instanceof InterpreterError ? error.message : String(error)
      );
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.yellow('\nGoodbye! 👋\n'));
    process.exit(0);
  });
}

/**
 * Processes a single message and outputs the result
 * @param message - The message to interpret
 * @param jsonOutput - Whether to output as JSON (default true)
 */
async function processSingleMessage(message: string, jsonOutput = true): Promise<void> {
  const interpreter = createInterpreter();

  try {
    const result = await interpreter.interpret(message);

    if (jsonOutput) {
      displayResult(result);
    } else {
      displayResultInteractive(result);
    }

    // Exit with error code if interpretation had an error
    if (result.error) {
      process.exit(1);
    }
  } catch (error) {
    console.error(
      chalk.red('Error:'),
      error instanceof InterpreterError ? error.message : String(error)
    );
    process.exit(1);
  }
}

/**
 * Main CLI program
 */
function main(): void {
  const program = new Command();

  program
    .name('intent-interpreter')
    .description('AI-powered chat message intent classifier using OpenRouter Grok')
    .version('1.0.0');

  program
    .option('-i, --interactive', 'Run in interactive mode')
    .option('-m, --message <text>', 'Single message to interpret')
    .option('--no-json', 'Output with colors instead of JSON (single message mode)')
    .action(async (options: { interactive?: boolean; message?: string; json: boolean }) => {
      if (options.interactive) {
        await runInteractiveMode();
      } else if (options.message) {
        await processSingleMessage(options.message, options.json);
      } else {
        // Default to interactive mode if no options specified
        await runInteractiveMode();
      }
    });

  program.parse();
}

// Run the CLI
main();
