import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, generateText, CoreMessage, stepCountIs } from 'ai';
import { AI_EMBEDDING_MODEL } from '../../shared/constants';

// Default models
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_MAX_STEPS = 10; // For multi-step agentic behavior

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
  maxSteps?: number; // For multi-step agentic behavior (uses stopWhen internally)
}

// Tools type from ai SDK
type AITools = Parameters<typeof streamText>[0]['tools'];

export class AIClient {
  private apiKey: string;
  private model: string;
  private embeddingModel: string;
  private openrouter: ReturnType<typeof createOpenRouter>;

  constructor(apiKey: string, model?: string, embeddingModel?: string) {
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODEL;
    this.embeddingModel = embeddingModel || AI_EMBEDDING_MODEL;
    this.openrouter = createOpenRouter({
      apiKey: this.apiKey,
    });
  }

  setModel(model: string) {
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }

  setEmbeddingModel(model: string) {
    this.embeddingModel = model;
  }

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  getApiKey(): string {
    return this.apiKey;
  }

  /**
   * Get dimensions for current embedding model
   * Most embedding models use 1536 or similar, we'll use that as default
   */
  private getEmbeddingDimensions(): number {
    // Common dimensions by model family
    if (this.embeddingModel.includes('text-embedding-3-large')) return 3072;
    if (this.embeddingModel.includes('text-embedding-3-small')) return 1536;
    if (this.embeddingModel.includes('ada')) return 1536;
    if (this.embeddingModel.includes('cohere')) return 1024;
    return DEFAULT_EMBEDDING_DIMENSIONS;
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

    // Use stopWhen for multi-step agentic behavior (v5 API)
    const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;

    if (options?.stream) {
      return streamText({
        model: modelInstance,
        messages: coreMessages,
        tools,
        stopWhen: stepCountIs(maxSteps),
      });
    }

    return generateText({
      model: modelInstance,
      messages: coreMessages,
      tools,
      stopWhen: stepCountIs(maxSteps),
    });
  }

  async streamChat(
    messages: ChatMessage[],
    tools: AITools,
    options?: Omit<ChatOptions, 'stream'>
  ) {
    return this.chat(messages, tools, { ...options, stream: true });
  }

  /**
   * Generate embedding for a single text using OpenRouter API
   */
  async embed(text: string): Promise<number[]> {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: text,
        dimensions: this.getEmbeddingDimensions(),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error: ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: texts,
        dimensions: this.getEmbeddingDimensions(),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error: ${error}`);
    }

    const data = await response.json();
    return data.data.map((item: { embedding: number[] }) => item.embedding);
  }
}

// Singleton instance - will be initialized with API key from settings
let aiClient: AIClient | null = null;

export function getAIClient(): AIClient | null {
  return aiClient;
}

export function initAIClient(apiKey: string, model?: string, embeddingModel?: string): AIClient {
  aiClient = new AIClient(apiKey, model, embeddingModel);
  return aiClient;
}

export function setAIModel(model: string): void {
  if (aiClient) {
    aiClient.setModel(model);
  }
}

export function getAIModel(): string | null {
  return aiClient?.getModel() || null;
}

export function setEmbeddingModel(model: string): void {
  if (aiClient) {
    aiClient.setEmbeddingModel(model);
  }
}

export function getEmbeddingModel(): string | null {
  return aiClient?.getEmbeddingModel() || null;
}

export function getApiKey(): string | null {
  return aiClient?.getApiKey() || null;
}
