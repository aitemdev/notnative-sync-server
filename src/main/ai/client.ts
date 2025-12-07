import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, generateText, CoreMessage } from 'ai';

// Default model
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: unknown;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

// Tools type from ai SDK
type AITools = Parameters<typeof streamText>[0]['tools'];

export class AIClient {
  private apiKey: string;
  private model: string;
  private openrouter: ReturnType<typeof createOpenRouter>;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODEL;
    this.openrouter = createOpenRouter({
      apiKey: this.apiKey,
    });
  }

  setModel(model: string) {
    this.model = model;
  }

  async chat(
    messages: ChatMessage[],
    tools: AITools,
    options?: ChatOptions
  ) {
    const modelInstance = this.openrouter(options?.model || this.model);

    const coreMessages: CoreMessage[] = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    if (options?.stream) {
      return streamText({
        model: modelInstance,
        messages: coreMessages,
        tools,
        maxSteps: 5, // Allow up to 5 tool calls in sequence
      });
    }

    return generateText({
      model: modelInstance,
      messages: coreMessages,
      tools,
      maxSteps: 5,
    });
  }

  async streamChat(
    messages: ChatMessage[],
    tools: AITools,
    options?: Omit<ChatOptions, 'stream'>
  ) {
    return this.chat(messages, tools, { ...options, stream: true });
  }
}

// Singleton instance - will be initialized with API key from settings
let aiClient: AIClient | null = null;

export function getAIClient(): AIClient | null {
  return aiClient;
}

export function initAIClient(apiKey: string, model?: string): AIClient {
  aiClient = new AIClient(apiKey, model);
  return aiClient;
}

export function setAIModel(model: string): void {
  if (aiClient) {
    aiClient.setModel(model);
  }
}
