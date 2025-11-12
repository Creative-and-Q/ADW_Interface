#!/usr/bin/env node

import { Command } from 'commander';
import * as readline from 'readline';
import chalk from 'chalk';
import * as dotenv from 'dotenv';
import { OpenRouterClient } from './openrouter-client.js';
import { CharacterManager } from './character-manager.js';
import { CLIResponse, CLIInput } from './types.js';

// Load environment variables
dotenv.config();

/**
 * Format and display CLI response as JSON
 */
function displayResponse(response: CLIResponse): void {
  console.log(JSON.stringify(response, null, 2));
}

/**
 * Create OpenRouter client from environment
 */
function createOpenRouterClient(): OpenRouterClient {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
  const baseUrl = process.env.OPENROUTER_BASE_URL;
  const temperature = parseFloat(process.env.AI_TEMPERATURE || '0.3');
  const maxTokens = parseInt(process.env.AI_MAX_TOKENS || '2000', 10);

  if (!apiKey) {
    console.error(
      JSON.stringify({
        success: false,
        error: 'OPENROUTER_API_KEY environment variable is required',
        message: 'Please create a .env file with your API key',
      }, null, 2)
    );
    process.exit(1);
  }

  return new OpenRouterClient({
    apiKey,
    model,
    baseUrl,
    temperature,
    maxTokens,
  });
}

/**
 * Create character manager
 */
function createCharacterManager(): CharacterManager {
  const client = createOpenRouterClient();
  return new CharacterManager(client);
}

/**
 * Process a single JSON input
 */
async function processSingleInput(jsonInput: string): Promise<void> {
  const manager = createCharacterManager();

  try {
    const parsed = JSON.parse(jsonInput) as CLIInput;

    if (!parsed.user_id) {
      displayResponse({
        success: false,
        error: 'Missing "user_id" field in JSON',
        message: 'JSON must contain a "user_id" field',
      });
      process.exit(1);
    }

    if (!parsed.input) {
      displayResponse({
        success: false,
        error: 'Missing "input" field in JSON',
        message: 'JSON must contain an "input" field with the message',
      });
      process.exit(1);
    }

    const response = await manager.processInput(parsed);
    displayResponse(response);

    if (!response.success) {
      process.exit(1);
    }
  } catch (error) {
    displayResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      message: 'Failed to process input',
    });
    process.exit(1);
  }
}

/**
 * Run interactive mode
 */
async function runInteractive(): Promise<void> {
  console.log(chalk.cyan('\n🎭 Character Controller - Interactive Mode\n'));
  console.log(chalk.gray('Enter JSON input with format:'));
  console.log(chalk.gray('  {"user_id": "user123", "input": "your message", "user_character": "CharName", "meta_data": {...}}'));
  console.log(chalk.gray('Commands: /list <user_id>, /stats [user_id], /get <user_id> <name>, /quit\n'));

  const manager = createCharacterManager();

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
      process.exit(0);
    }

    if (input.startsWith('/list ')) {
      const userId = input.substring(6).trim();
      try {
        const characters = await manager.listCharacters(userId);
        displayResponse({
          success: true,
          message: `Found ${characters.length} character(s) for user ${userId}`,
          context: {
            name: 'system',
            relevantInfo: {
              other: { userId, characters },
            },
          },
        });
      } catch (error) {
        displayResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: 'Failed to list characters',
        });
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('/stats')) {
      const userId = input.substring(6).trim() || undefined;
      try {
        const stats = await manager.getStats(userId);
        displayResponse({
          success: true,
          message: userId ? `Statistics for user ${userId}` : 'Global statistics',
          context: {
            name: 'system',
            relevantInfo: {
              other: stats,
            },
          },
        });
      } catch (error) {
        displayResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: 'Failed to get statistics',
        });
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('/get ')) {
      const parts = input.substring(5).trim().split(' ');
      if (parts.length < 2) {
        displayResponse({
          success: false,
          message: 'Usage: /get <user_id> <character_name>',
        });
        rl.prompt();
        return;
      }
      const [userId, ...nameParts] = parts;
      const name = nameParts.join(' ');
      try {
        const character = await manager.getCharacter(userId, name);
        if (character) {
          displayResponse({
            success: true,
            message: `Character: ${name}`,
            context: {
              name,
              relevantInfo: {
                other: character,
              },
            },
          });
        } else {
          displayResponse({
            success: false,
            message: `Character not found: ${name} for user ${userId}`,
          });
        }
      } catch (error) {
        displayResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: `Failed to get character: ${name}`,
        });
      }
      rl.prompt();
      return;
    }

    // Process JSON input
    try {
      const parsed = JSON.parse(input) as CLIInput;

      if (!parsed.user_id) {
        displayResponse({
          success: false,
          error: 'Missing "user_id" field',
          message: 'JSON must contain a "user_id" field',
        });
        rl.prompt();
        return;
      }

      if (!parsed.input) {
        displayResponse({
          success: false,
          error: 'Missing "input" field',
          message: 'JSON must contain an "input" field',
        });
        rl.prompt();
        return;
      }

      const response = await manager.processInput(parsed);
      displayResponse(response);
    } catch (error) {
      displayResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: 'Invalid JSON or processing error',
      });
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.yellow('\nGoodbye! 👋\n'));
    process.exit(0);
  });
}

/**
 * Main CLI program
 */
function main(): void {
  const program = new Command();

  program
    .name('character-controller')
    .description('AI-powered character sheet management system')
    .version('1.0.0');

  program
    .option('-i, --interactive', 'Run in interactive mode')
    .option('-j, --json <input>', 'Process single JSON input')
    .action(async (options: { interactive?: boolean; json?: string }) => {
      if (options.json) {
        await processSingleInput(options.json);
      } else {
        await runInteractive();
      }
    });

  program.parse();
}

// Run CLI
main();
