/**
 * AI Agent Service
 *
 * Conversational AI that can create, read, update, and evolve chains
 * through natural language interactions.
 */

import axios from 'axios';
import { ChainManager } from './chain-manager.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Message {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
}

interface AgentFunction {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}

export class AIAgent {
  private chainManager: ChainManager;
  private apiKey: string;
  private model: string;
  private systemPrompt: string;

  constructor(chainManager: ChainManager) {
    this.chainManager = chainManager;

    // Use OpenRouter or OpenAI - check which API key is available
    this.apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '';
    this.model = process.env.AI_AGENT_MODEL || 'anthropic/claude-3.5-sonnet';

    if (!this.apiKey) {
      console.warn('⚠️  No AI API key found. AI Agent will not function. Set OPENROUTER_API_KEY or OPENAI_API_KEY.');
    }

    // Load system prompt with documentation
    this.systemPrompt = this.buildSystemPrompt();
  }

  /**
   * Build comprehensive system prompt with documentation
   */
  private buildSystemPrompt(): string {
    const docsPath = path.join(__dirname, '..', 'AI_AGENT_GUIDE.md');
    const patternsPath = path.join(__dirname, '..', 'CHAIN_PATTERNS.md');
    const quickRefPath = path.join(__dirname, '..', 'QUICK_REFERENCE.md');

    let docs = '';

    try {
      if (fs.existsSync(docsPath)) {
        docs += fs.readFileSync(docsPath, 'utf-8') + '\n\n';
      }
      if (fs.existsSync(patternsPath)) {
        docs += fs.readFileSync(patternsPath, 'utf-8') + '\n\n';
      }
      if (fs.existsSync(quickRefPath)) {
        docs += fs.readFileSync(quickRefPath, 'utf-8');
      }
    } catch (error) {
      console.error('Failed to load documentation files:', error);
    }

    return `You are an expert AI agent for the AIController chain orchestration system.

Your role is to help users create, modify, and manage chains through natural language.

# Your Capabilities

You can:
- Create new chains from natural language descriptions
- Read and analyze existing chains
- Modify and update existing chains
- Delete chains
- Explain how chains work
- Suggest improvements to chains
- Debug chain issues

# Available Functions

You have access to these functions:

1. **list_chains()** - Get all chains in the system
2. **get_chain(chain_id)** - Get details of a specific chain
3. **create_chain(chain_config)** - Create a new chain
4. **update_chain(chain_id, chain_config)** - Update existing chain
5. **delete_chain(chain_id)** - Delete a chain
6. **test_chain(chain_id, input)** - Test execute a chain

# How to Respond

- Be conversational and helpful
- When creating/updating chains, explain what you're doing
- Show the user the chain configuration you create
- Ask clarifying questions if the request is ambiguous
- Suggest improvements when appropriate
- Use the functions to actually create/modify chains

# Documentation

${docs}

# Important Notes

- Always validate chain configurations before creating/updating
- Use proper variable syntax: {{input.field}}, {{step_N.result.field}}
- Template variables for arrays/objects must be quoted: "{{step_1.result}}"
- Step IDs should follow pattern: step_1, step_2, etc.
- Routing targets are numeric indices (0-based)
- Always include helpful step names and descriptions

When users ask you to create or modify chains, use the functions to actually perform the operations, then confirm what you did.`;
  }

  /**
   * Get available functions for the AI agent
   */
  private getFunctions(): AgentFunction[] {
    return [
      {
        name: 'list_chains',
        description: 'List all chains in the system with their IDs, names, and descriptions',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_chain',
        description: 'Get full details of a specific chain by ID',
        parameters: {
          type: 'object',
          properties: {
            chain_id: {
              type: 'number',
              description: 'The ID of the chain to retrieve'
            }
          },
          required: ['chain_id']
        }
      },
      {
        name: 'create_chain',
        description: 'Create a new chain in the system',
        parameters: {
          type: 'object',
          properties: {
            chain_config: {
              type: 'object',
              description: 'The complete chain configuration object including name, steps, owner, etc.'
            }
          },
          required: ['chain_config']
        }
      },
      {
        name: 'update_chain',
        description: 'Update an existing chain',
        parameters: {
          type: 'object',
          properties: {
            chain_id: {
              type: 'number',
              description: 'The ID of the chain to update'
            },
            chain_config: {
              type: 'object',
              description: 'The updated chain configuration'
            }
          },
          required: ['chain_id', 'chain_config']
        }
      },
      {
        name: 'delete_chain',
        description: 'Delete a chain from the system',
        parameters: {
          type: 'object',
          properties: {
            chain_id: {
              type: 'number',
              description: 'The ID of the chain to delete'
            }
          },
          required: ['chain_id']
        }
      },
      {
        name: 'test_chain',
        description: 'Test execute a chain with given input and return the results including output template',
        parameters: {
          type: 'object',
          properties: {
            chain_id: {
              type: 'number',
              description: 'The ID of the chain to test'
            },
            input: {
              type: 'object',
              description: 'Input data for the chain execution'
            }
          },
          required: ['chain_id']
        }
      }
    ];
  }

  /**
   * Execute a function call from the AI
   */
  private async executeFunction(name: string, args: any): Promise<string> {
    try {
      console.log(`🤖 AI Agent executing function: ${name}`, args);

      switch (name) {
        case 'list_chains': {
          const chains = await this.chainManager.getAllChains();
          console.log(`🤖 AI Agent: Found ${chains.length} chains`);
          console.log('🤖 Chains data:', JSON.stringify(chains, null, 2));

          const result = {
            count: chains.length,
            chains: chains.map(c => ({
              id: c.id,
              name: c.name,
              description: c.description,
              owner: c.user_id,
              stepCount: c.steps?.length || 0,
              created_at: c.created_at
            }))
          };

          const jsonResult = JSON.stringify(result, null, 2);
          console.log('🤖 Returning to AI:', jsonResult);
          return jsonResult;
        }

        case 'get_chain': {
          const chain = await this.chainManager.getChain(args.chain_id);
          if (!chain) {
            return JSON.stringify({ error: 'Chain not found' });
          }
          return JSON.stringify(chain, null, 2);
        }

        case 'create_chain': {
          const created = await this.chainManager.createChain(args.chain_config);
          return JSON.stringify({
            success: true,
            chain_id: created.id,
            message: `Chain "${created.name}" created successfully with ID ${created.id}`
          }, null, 2);
        }

        case 'update_chain': {
          await this.chainManager.updateChain(args.chain_id, args.chain_config);
          return JSON.stringify({
            success: true,
            message: `Chain ${args.chain_id} updated successfully`
          });
        }

        case 'delete_chain': {
          await this.chainManager.deleteChain(args.chain_id);
          return JSON.stringify({
            success: true,
            message: `Chain ${args.chain_id} deleted successfully`
          });
        }

        case 'test_chain': {
          console.log(`🤖 AI Agent testing chain: ${args.chain_id}`, args.input);
          const result = await this.chainManager.executeChain(args.chain_id, args.input || {}, 'ai-agent');

          console.log(`🤖 Chain test completed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
          if (result.output) {
            console.log(`🤖 Output generated:`, JSON.stringify(result.output, null, 2));
          }

          // Return a user-friendly summary instead of raw JSON
          let summary = `**Chain Execution Results:**\n\n`;
          summary += `**Chain:** ${result.chain_name} (ID: ${result.chain_id})\n`;
          summary += `**Status:** ${result.success ? '✅ Success' : '❌ Failed'}\n`;
          summary += `**Duration:** ${result.total_duration_ms}ms\n`;
          summary += `**Steps:** ${result.steps.length}\n\n`;

          if (result.output) {
            summary += `**Output:**\n\`\`\`json\n${JSON.stringify(result.output, null, 2)}\n\`\`\`\n\n`;
          } else {
            summary += `**Output:** No output template defined\n\n`;
          }

          if (result.steps && result.steps.length > 0) {
            summary += `**Step Summary:**\n`;
            result.steps.forEach((step, index) => {
              const status = step.success ? '✅' : '❌';
              summary += `${index + 1}. ${step.step_name || step.step_id} - ${status} (${step.duration_ms}ms)\n`;
            });
          }

          return summary;
        }

        default:
          return JSON.stringify({ error: 'Unknown function' });
      }
    } catch (error: any) {
      return JSON.stringify({
        error: error.message || 'Function execution failed'
      });
    }
  }

  /**
   * Chat with the AI agent
   */
  async chat(messages: Message[]): Promise<{ role: string; content: string }> {
    if (!this.apiKey) {
      return {
        role: 'assistant',
        content: 'AI Agent is not configured. Please set OPENROUTER_API_KEY or OPENAI_API_KEY environment variable.'
      };
    }

    // Check for direct function calls based on user message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'user') {
      const userMessage = lastMessage.content.toLowerCase();

      // Direct function calls for common queries
      if (userMessage.includes('show me all') && userMessage.includes('chains')) {
        console.log('🤖 Direct function call: list_chains');
        try {
          const result = await this.executeFunction('list_chains', {});
          const chainsData = JSON.parse(result);

          let response = 'Here are all the chains currently in the system:\n\n';
          if (chainsData.count === 0) {
            response += '- **No chains found.**\n  The system is empty right now.';
          } else {
            chainsData.chains.forEach((chain: any) => {
              response += `- **Chain #${chain.id}: ${chain.name}**\n`;
              if (chain.description) response += `  ${chain.description}\n`;
              response += `  Owner: ${chain.owner}, Steps: ${chain.stepCount}\n\n`;
            });
          }

          console.log('🤖 Direct response ready');
          return {
            role: 'assistant',
            content: response
          };
        } catch (error: any) {
          console.log('🤖 Direct call error:', error.message);
          return {
            role: 'assistant',
            content: `Sorry, I encountered an error retrieving chains: ${error.message}`
          };
        }
      }

      // Get specific chain by ID
      const getChainMatch = userMessage.match(/(?:get|show|tell me about)\s+chain\s+(?:#|number)?(\d+)/i);
      if (getChainMatch) {
        const chainId = parseInt(getChainMatch[1]);
        console.log(`🤖 Direct function call: get_chain(${chainId})`);
        try {
          const result = await this.executeFunction('get_chain', { chain_id: chainId });
          const chainData = JSON.parse(result);

          let response = `**Chain #${chainData.id}: ${chainData.name}**\n\n`;
          if (chainData.description) response += `**Description:** ${chainData.description}\n\n`;
          response += `**Owner:** ${chainData.user_id}\n`;
          response += `**Steps:** ${chainData.steps?.length || 0}\n\n`;

          if (chainData.steps && chainData.steps.length > 0) {
            response += '**Steps:**\n';
            chainData.steps.forEach((step: any, index: number) => {
              response += `${index + 1}. **${step.name || `Step ${index + 1}`}**\n`;
              response += `   - Module: ${step.module}\n`;
              response += `   - Endpoint: ${step.endpoint}\n`;
              if (step.params) response += `   - Params: ${JSON.stringify(step.params, null, 2)}\n`;
              response += '\n';
            });
          }

          console.log('🤖 Direct response ready');
          return {
            role: 'assistant',
            content: response
          };
        } catch (error: any) {
          console.log('🤖 Direct call error:', error.message);
          return {
            role: 'assistant',
            content: `Sorry, I couldn't find chain #${chainId}: ${error.message}`
          };
        }
      }

      // Delete chain
      const deleteChainMatch = userMessage.match(/(?:delete|remove|erase)\s+chain\s+(?:#|number)?(\d+)/i);
      if (deleteChainMatch) {
        const chainId = parseInt(deleteChainMatch[1]);
        console.log(`🤖 Direct function call: delete_chain(${chainId})`);
        try {
          await this.executeFunction('delete_chain', { chain_id: chainId });

          console.log('🤖 Direct response ready');
          return {
            role: 'assistant',
            content: `✅ Successfully deleted chain #${chainId}`
          };
        } catch (error: any) {
          console.log('🤖 Direct call error:', error.message);
          return {
            role: 'assistant',
            content: `Sorry, I couldn't delete chain #${chainId}: ${error.message}`
          };
        }
      }

      // Create chain - defer to AI processing
      if (userMessage.includes('create') && userMessage.includes('chain')) {
        console.log('🤖 Detected create chain request - deferring to AI processing');
        // Let the AI handle this through the normal flow since it requires complex parsing
      }

      // Test chain
      const testChainMatch = userMessage.match(/(?:test|execute|run)\s+chain\s+(?:#|number)?(\d+)/i);
      if (testChainMatch) {
        const chainId = parseInt(testChainMatch[1]);
        console.log(`🤖 Direct function call: test_chain(${chainId})`);

        // Extract input data from the message if present
        let input = {};
        const inputMatch = userMessage.match(/input:\s*(\{.*\})/i);
        if (inputMatch) {
          try {
            input = JSON.parse(inputMatch[1]);
          } catch (e) {
            console.log('🤖 Could not parse input JSON, using empty object');
          }
        }

        try {
          const result = await this.executeFunction('test_chain', { chain_id: chainId, input });

          console.log('🤖 Direct response ready');
          return {
            role: 'assistant',
            content: `**Chain Test Results for #${chainId}:**\n\n${result}`
          };
        } catch (error: any) {
          console.log('🤖 Direct call error:', error.message);
          return {
            role: 'assistant',
            content: `Sorry, I couldn't test chain #${chainId}: ${error.message}`
          };
        }
      }

      // Update chain - defer to AI processing
      if ((userMessage.includes('update') || userMessage.includes('edit') || userMessage.includes('modify')) && userMessage.includes('chain')) {
        console.log('🤖 Detected update chain request - deferring to AI processing');
        // Let the AI handle this through the normal flow since it requires complex parsing
      }
    }

    try {
      // Determine API endpoint and format based on API key type
      const isOpenRouter = !!process.env.OPENROUTER_API_KEY;
      const endpoint = isOpenRouter
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      };

      if (isOpenRouter) {
        headers['HTTP-Referer'] = 'https://github.com/yourusername/ex_nihilo';
        headers['X-Title'] = 'AIController Agent';
      }

      // Build messages with system prompt
      const allMessages = [
        { role: 'system', content: this.systemPrompt },
        ...messages
      ];

      // Make API call
      const response = await axios.post(
        endpoint,
        {
          model: this.model,
          messages: allMessages,
          functions: this.getFunctions(),
          function_call: 'auto',
          temperature: 0.7,
          max_tokens: 2000
        },
        { headers }
      );

      const choice = response.data.choices[0];
      const message = choice.message;

      console.log('🤖 Raw AI response message:', JSON.stringify(message, null, 2));

      // Check if AI wants to call a function (standard format)
      let functionName: string | null = null;
      let functionArgs: any = {};

      if (message.function_call) {
        // Standard OpenAI format
        functionName = message.function_call.name;
        functionArgs = JSON.parse(message.function_call.arguments);
      } else if (message.content && typeof message.content === 'string') {
        // Check for XML-style function calls in content (Claude/OpenRouter format)
        const functionCallMatch = message.content.match(/<function_call\s+name="([^"]+)"(?:\s*>([\s\S]*?)<\/function_call>|\s*\/>)/);

        if (functionCallMatch) {
          functionName = functionCallMatch[1];
          const argsContent = functionCallMatch[2];

          console.log(`🤖 Detected XML-style function call: ${functionName}`);

          // Try to parse arguments if they exist
          if (argsContent && argsContent.trim()) {
            try {
              functionArgs = JSON.parse(argsContent.trim());
            } catch (e) {
              // If not JSON, treat as empty args
              functionArgs = {};
            }
          }
        }
      }

      // Execute function if detected
      if (functionName) {
        console.log(`🤖 AI wants to call function: ${functionName}`, functionArgs);

        // Execute the function
        const functionResult = await this.executeFunction(functionName, functionArgs);
        console.log(`🤖 Function result length: ${functionResult.length} chars`);

        // Send function result back to AI for final response
        const followUpMessages = [
          ...allMessages,
          {
            role: 'assistant',
            content: `I'm calling the function ${functionName} to get the information you requested.`
          },
          {
            role: 'user',
            content: `Function ${functionName} returned:\n${functionResult}\n\nPlease provide a helpful response to the user based on this data.`
          }
        ];

        console.log(`🤖 Sending function result back to AI for interpretation...`);

        const followUpResponse = await axios.post(
          endpoint,
          {
            model: this.model,
            messages: followUpMessages,
            temperature: 0.7,
            max_tokens: 2000
          },
          { headers }
        );

        const finalContent = followUpResponse.data.choices[0].message.content;
        console.log(`🤖 AI final response: ${finalContent.substring(0, 200)}...`);

        return {
          role: 'assistant',
          content: finalContent
        };
      }

      // No function call, return direct response
      return {
        role: 'assistant',
        content: message.content
      };

    } catch (error: any) {
      console.error('AI Agent error:', error.response?.data || error.message);
      return {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.response?.data?.error?.message || error.message}`
      };
    }
  }
}
