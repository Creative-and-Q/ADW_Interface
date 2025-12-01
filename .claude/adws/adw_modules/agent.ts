import { spawn } from 'child_process';
import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, '../../../.env'), override: true });

export enum RetryCode {
  CLAUDE_CODE_ERROR = 'claude_code_error',
  TIMEOUT_ERROR = 'timeout_error',
  EXECUTION_ERROR = 'execution_error',
  ERROR_DURING_EXECUTION = 'error_during_execution',
  NONE = 'none',
}

export type Model = 'sonnet' | 'opus';

export interface AgentPromptRequest {
  prompt: string;
  adwId: string;
  agentName?: string;
  model?: Model;
  dangerouslySkipPermissions?: boolean;
  outputFile: string;
  workingDir?: string;
}

export interface AgentPromptResponse {
  output: string;
  success: boolean;
  sessionId?: string;
  retryCode: RetryCode;
}

export interface AgentTemplateRequest {
  agentName: string;
  slashCommand: string;
  args: string[];
  adwId: string;
  model?: Model;
  workingDir?: string;
}

export interface ClaudeCodeResultMessage {
  type: string;
  subtype: string;
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result: string;
  session_id: string;
  total_cost_usd: number;
}

export const OUTPUT_JSONL = 'cc_raw_output.jsonl';
export const OUTPUT_JSON = 'cc_raw_output.json';
export const FINAL_OBJECT_JSON = 'cc_final_object.json';
export const SUMMARY_JSON = 'custom_summary_output.json';

export const generateShortId = (): string => {
  return randomUUID().substring(0, 8);
};

const getSafeSubprocessEnv = (): Record<string, string> => {
  const safeEnv: Record<string, string | undefined> = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    CLAUDE_CODE_PATH: process.env.CLAUDE_CODE_PATH || 'claude',
    CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR: process.env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR || 'true',
    HOME: process.env.HOME,
    USER: process.env.USER,
    PATH: process.env.PATH,
    SHELL: process.env.SHELL,
    TERM: process.env.TERM,
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    PWD: process.cwd(),
  };

  return Object.fromEntries(
    Object.entries(safeEnv).filter(([_, v]) => v !== undefined)
  ) as Record<string, string>;
};

const truncateOutput = (output: string, maxLength: number = 500, suffix: string = '... (truncated)'): string => {
  if (output.startsWith('{"type":') && output.includes('\n{"type":')) {
    const lines = output.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const data = JSON.parse(lines[i]);
        if (data.type === 'result' && data.result) return truncateOutput(data.result, maxLength, suffix);
        if (data.type === 'assistant' && data.message?.content?.[0]?.text) {
          return truncateOutput(data.message.content[0].text, maxLength, suffix);
        }
      } catch {}
    }
    return `[JSONL output with ${lines.length} messages]${suffix}`;
  }

  if (output.length <= maxLength) return output;

  const truncateAt = maxLength - suffix.length;
  const newlinePos = output.lastIndexOf('\n', truncateAt);
  if (newlinePos > truncateAt - 50) return output.substring(0, newlinePos) + suffix;

  const spacePos = output.lastIndexOf(' ', truncateAt);
  if (spacePos > truncateAt - 20) return output.substring(0, spacePos) + suffix;

  return output.substring(0, truncateAt) + suffix;
};

const checkClaudeInstalled = async (): Promise<[boolean, string | null]> => {
  const claudePath = process.env.CLAUDE_CODE_PATH || 'claude';
  
  return new Promise((resolve) => {
    const proc = spawn(claudePath, ['--version']);
    
    proc.on('error', () => {
      resolve([false, `Error: Claude Code CLI is not installed. Expected at: ${claudePath}`]);
    });
    
    proc.on('exit', (code) => {
      if (code !== 0) {
        resolve([false, `Error: Claude Code CLI is not installed. Expected at: ${claudePath}`]);
        return;
      }
      resolve([true, null]);
    });
  });
};

const parseJsonlOutput = async (outputFile: string): Promise<[any[], any | null]> => {
  try {
    const content = await fs.readFile(outputFile, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    const messages = lines.map(line => JSON.parse(line));
    
    let resultMessage: any = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'result') {
        resultMessage = messages[i];
        break;
      }
    }
    
    return [messages, resultMessage];
  } catch {
    return [[], null];
  }
};

const convertJsonlToJson = async (jsonlFile: string): Promise<[string, Error | null]> => {
  try {
    const outputDir = path.dirname(jsonlFile);
    const jsonFile = path.join(outputDir, OUTPUT_JSON);
    
    const [messages] = await parseJsonlOutput(jsonlFile);
    await fs.writeFile(jsonFile, JSON.stringify(messages, null, 2));
    
    return [jsonFile, null];
  } catch (err) {
    return ['', err as Error];
  }
};

const saveLastEntryAsRawResult = async (jsonFile: string): Promise<[string | null, Error | null]> => {
  try {
    const content = await fs.readFile(jsonFile, 'utf-8');
    const messages = JSON.parse(content);
    
    if (!messages || messages.length === 0) return [null, null];
    
    const lastEntry = messages[messages.length - 1];
    const outputDir = path.dirname(jsonFile);
    const finalObjectFile = path.join(outputDir, FINAL_OBJECT_JSON);
    
    await fs.writeFile(finalObjectFile, JSON.stringify(lastEntry, null, 2));
    return [finalObjectFile, null];
  } catch (err) {
    return [null, err as Error];
  }
};

const savePrompt = async (prompt: string, adwId: string, agentName: string = 'ops'): Promise<void> => {
  const match = prompt.match(/^(\/\w+)/);
  if (!match) return;
  
  const slashCommand = match[1];
  const commandName = slashCommand.substring(1);
  
  const projectRoot = path.resolve(__dirname, '../../..');
  const promptDir = path.join(projectRoot, '.claude', 'agents', adwId, agentName, 'prompts');
  await fs.mkdir(promptDir, { recursive: true });
  
  const promptFile = path.join(promptDir, `${commandName}.txt`);
  await fs.writeFile(promptFile, prompt);
};

export const promptClaudeCode = async (request: AgentPromptRequest): Promise<AgentPromptResponse> => {
  const [installed, installError] = await checkClaudeInstalled();
  if (!installed) {
    return {
      output: installError!,
      success: false,
      retryCode: RetryCode.NONE,
    };
  }

  await savePrompt(request.prompt, request.adwId, request.agentName || 'ops');

  const outputDir = path.dirname(request.outputFile);
  if (outputDir) await fs.mkdir(outputDir, { recursive: true });

  const claudePath = process.env.CLAUDE_CODE_PATH || 'claude';
  const cmd = [
    '-p', request.prompt,
    '--model', request.model || 'sonnet',
    '--output-format', 'stream-json',
    '--verbose',
  ];

  if (request.workingDir) {
    const mcpConfigPath = path.join(request.workingDir, '.mcp.json');
    try {
      await fs.access(mcpConfigPath);
      cmd.push('--mcp-config', mcpConfigPath);
    } catch {}
  }

  if (request.dangerouslySkipPermissions) cmd.push('--dangerously-skip-permissions');

  const env = getSafeSubprocessEnv();

  return new Promise((resolve) => {
    const proc = spawn(claudePath, cmd, {
      cwd: request.workingDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const outputStream = createWriteStream(request.outputFile);
    proc.stdout.pipe(outputStream);

    let stderr = '';
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      resolve({
        output: `Error spawning process: ${err.message}`,
        success: false,
        retryCode: RetryCode.EXECUTION_ERROR,
      });
    });

    proc.on('close', async (code) => {
      
      await new Promise<void>((resolveStream) => {
        outputStream.end(() => resolveStream());
      });

      if (code === 0) {
        const [messages, resultMessage] = await parseJsonlOutput(request.outputFile);
        const [jsonFile] = await convertJsonlToJson(request.outputFile);
        if (jsonFile) await saveLastEntryAsRawResult(jsonFile);

        if (resultMessage) {
          const sessionId = resultMessage.session_id;
          const isError = resultMessage.is_error || false;
          const subtype = resultMessage.subtype || '';

          if (subtype === 'error_during_execution') {
            resolve({
              output: 'Error during execution: Agent encountered an error and did not return a result',
              success: false,
              sessionId,
              retryCode: RetryCode.ERROR_DURING_EXECUTION,
            });
            return;
          }

          let resultText = resultMessage.result || '';
          if (isError && resultText.length > 1000) {
            resultText = truncateOutput(resultText, 800);
          }

          resolve({
            output: resultText,
            success: !isError,
            sessionId,
            retryCode: RetryCode.NONE,
          });
          return;
        }

        resolve({
          output: truncateOutput('No result message found in Claude Code output', 800),
          success: false,
          retryCode: RetryCode.NONE,
        });
        return;
      }

      resolve({
        output: truncateOutput(`Claude Code error: ${stderr || 'Command failed'}`, 800),
        success: false,
        retryCode: RetryCode.CLAUDE_CODE_ERROR,
      });
    });

    proc.on('error', (err) => {
      resolve({
        output: `Error executing Claude Code: ${err.message}`,
        success: false,
        retryCode: RetryCode.EXECUTION_ERROR,
      });
    });
  });
};

export const promptClaudeCodeWithRetry = async (
  request: AgentPromptRequest,
  maxRetries: number = 3,
  retryDelays: number[] = [1000, 3000, 5000]
): Promise<AgentPromptResponse> => {
  let lastResponse: AgentPromptResponse | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = retryDelays[attempt - 1] || retryDelays[retryDelays.length - 1];
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const response = await promptClaudeCode(request);
    lastResponse = response;

    if (response.success || response.retryCode === RetryCode.NONE) return response;

    const retryableCodes = [
      RetryCode.CLAUDE_CODE_ERROR,
      RetryCode.TIMEOUT_ERROR,
      RetryCode.EXECUTION_ERROR,
      RetryCode.ERROR_DURING_EXECUTION,
    ];

    if (retryableCodes.includes(response.retryCode)) {
      if (attempt < maxRetries) continue;
      return response;
    }
  }

  return lastResponse!;
};

export const executeTemplate = async (request: AgentTemplateRequest): Promise<AgentPromptResponse> => {
  const prompt = `${request.slashCommand} ${request.args.join(' ')}`;
  
  const projectRoot = path.resolve(__dirname, '../../..');
  const outputDir = path.join(projectRoot, '.claude', 'agents', request.adwId, request.agentName);
  await fs.mkdir(outputDir, { recursive: true });
  
  const outputFile = path.join(outputDir, OUTPUT_JSONL);
  
  const promptRequest: AgentPromptRequest = {
    prompt,
    adwId: request.adwId,
    agentName: request.agentName,
    model: request.model || 'sonnet',
    dangerouslySkipPermissions: true,
    outputFile,
    workingDir: request.workingDir,
  };
  
  return promptClaudeCodeWithRetry(promptRequest);
};

