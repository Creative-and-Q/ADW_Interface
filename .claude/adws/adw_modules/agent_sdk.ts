import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

export interface ClaudeCodeOptions {
  model?: string;
  allowedTools?: string[];
  cwd?: string;
  permissionMode?: 'bypassPermissions' | 'auto';
  resume?: string;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: any;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface AssistantMessage {
  type: 'assistant';
  content?: ContentBlock[];
  message?: {
    content: ContentBlock[];
  };
}

export interface UserMessage {
  type: 'user';
  content: string;
}

export interface SystemMessage {
  type: 'system';
  content: string;
}

export interface ResultMessage {
  type: 'result';
  subtype: string;
  is_error: boolean;
  result?: string;
  session_id?: string;
  total_cost_usd?: number;
  duration_ms?: number;
}

export type Message = AssistantMessage | UserMessage | SystemMessage | ResultMessage;

export const generateShortId = (): string => randomUUID().substring(0, 8);

export const extractText = (message: AssistantMessage): string => {
  const texts: string[] = [];
  // Handle both direct content array and nested message.content structure
  const content = message.content || (message as any).message?.content || [];
  for (const block of content) {
    if (block.type === 'text') texts.push(block.text);
  }
  return texts.join('\n');
};

export const extractToolUses = (message: AssistantMessage): ToolUseBlock[] => {
  const content = message.content || (message as any).message?.content || [];
  return content.filter((block: any): block is ToolUseBlock => block.type === 'tool_use');
};

export const getResultText = (messages: Message[]): string => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === 'result' && msg.result) return msg.result;
  }

  const texts: string[] = [];
  for (const msg of messages) {
    if (msg.type === 'assistant') {
      const text = extractText(msg);
      if (text) texts.push(text);
    }
  }

  return texts.join('\n');
};

export const simpleQuery = async (prompt: string, model: string = 'claude-sonnet-4-20250514'): Promise<[string, Error | null]> => {
  const options: ClaudeCodeOptions = { model };
  
  try {
    const texts: string[] = [];
    for await (const message of query(prompt, options)) {
      if (message.type === 'assistant') {
        const text = extractText(message);
        if (text) texts.push(text);
      }
    }
    
    const result = texts.length > 0 ? texts.join('\n') : 'No response';
    return [result, null];
  } catch (err) {
    return ['', err as Error];
  }
};

export async function* query(prompt: string, options?: ClaudeCodeOptions): AsyncGenerator<Message> {
  const claudePath = process.env.CLAUDE_CODE_PATH || 'claude';
  const cmd = ['-p', prompt];

  if (options?.model) cmd.push('--model', options.model);
  if (options?.permissionMode === 'bypassPermissions') cmd.push('--dangerously-skip-permissions');
  if (options?.allowedTools) cmd.push('--tools', options.allowedTools.join(','));
  if (options?.resume) cmd.push('--resume', options.resume);

  cmd.push('--output-format', 'stream-json', '--verbose');

  const proc = spawn(claudePath, cmd, {
    cwd: options?.cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let buffer = '';

  for await (const chunk of proc.stdout) {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        yield message;
      } catch {}
    }
  }

  if (buffer.trim()) {
    try {
      const message = JSON.parse(buffer);
      yield message;
    } catch {}
  }
}

export const collectQueryResponse = async (
  prompt: string,
  options?: ClaudeCodeOptions
): Promise<[Message[], ResultMessage | null, Error | null]> => {
  try {
    const messages: Message[] = [];
    let result: ResultMessage | null = null;

    for await (const message of query(prompt, options)) {
      messages.push(message);
      if (message.type === 'result') result = message;
    }

    return [messages, result, null];
  } catch (err) {
    return [[], null, err as Error];
  }
};

export class ClaudeSDKClient {
  private options: ClaudeCodeOptions;
  private proc: any = null;
  private buffer = '';

  constructor(options: ClaudeCodeOptions = {}) {
    this.options = options;
  }

  async connect(): Promise<[boolean, Error | null]> {
    try {
      const claudePath = process.env.CLAUDE_CODE_PATH || 'claude';
      const cmd = ['--interactive'];

      if (this.options.model) cmd.push('--model', this.options.model);
      if (this.options.permissionMode === 'bypassPermissions') cmd.push('--dangerously-skip-permissions');
      if (this.options.resume) cmd.push('--resume', this.options.resume);

      cmd.push('--output-format', 'stream-json', '--verbose');

      this.proc = spawn(claudePath, cmd, {
        cwd: this.options.cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      return [true, null];
    } catch (err) {
      return [false, err as Error];
    }
  }

  async query(prompt: string): Promise<[boolean, Error | null]> {
    if (!this.proc) return [false, new Error('Client not connected')];
    
    try {
      this.proc.stdin.write(prompt + '\n');
      return [true, null];
    } catch (err) {
      return [false, err as Error];
    }
  }

  async* receiveResponse(): AsyncGenerator<Message> {
    if (!this.proc) return;

    for await (const chunk of this.proc.stdout) {
      this.buffer += chunk.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          yield message;
          if (message.type === 'result') return;
        } catch {}
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }
}

export const createSession = async (
  model: string = 'claude-sonnet-4-20250514',
  workingDir?: string
): Promise<[ClaudeSDKClient, Error | null]> => {
  const options: ClaudeCodeOptions = {
    model,
    cwd: workingDir,
    permissionMode: 'bypassPermissions',
  };

  const client = new ClaudeSDKClient(options);
  const [connected, err] = await client.connect();
  
  if (!connected) return [client, err];
  return [client, null];
};

export const safeQuery = async (prompt: string): Promise<[string | null, string | null]> => {
  try {
    const [response, err] = await simpleQuery(prompt);
    if (err) return [null, err.message];
    return [response, null];
  } catch (err) {
    return [null, (err as Error).message];
  }
};

export const streamWithProgress = async (
  prompt: string,
  onText?: (text: string) => void,
  onTool?: (tool: ToolUseBlock) => void
): Promise<[ResultMessage | null, Error | null]> => {
  try {
    let result: ResultMessage | null = null;

    for await (const message of query(prompt)) {
      if (message.type === 'assistant') {
        const content = message.content || (message as any).message?.content || [];
        for (const block of content) {
          if (block.type === 'text' && onText) onText(block.text);
          if (block.type === 'tool_use' && onTool) onTool(block);
        }
      }
      
      if (message.type === 'result') result = message;
    }

    return [result, null];
  } catch (err) {
    return [null, err as Error];
  }
};

export const queryWithTimeout = async (
  prompt: string,
  timeoutSeconds: number = 30
): Promise<[string | null, Error | null]> => {
  const timeoutPromise = new Promise<[string | null, Error | null]>((resolve) => {
    setTimeout(() => resolve([null, new Error('Query timed out')]), timeoutSeconds * 1000);
  });

  const queryPromise = simpleQuery(prompt);

  return Promise.race([queryPromise, timeoutPromise]);
};

