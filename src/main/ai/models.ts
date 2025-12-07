/**
 * OpenRouter Models API
 * Fetches available models from OpenRouter API
 */

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  top_provider?: {
    max_completion_tokens?: number;
  };
  architecture?: {
    modality: string;
    tokenizer: string;
    instruct_type?: string;
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  pricing: string;
  isChat: boolean;
  isEmbedding: boolean;
}

// Cache for models
let cachedModels: OpenRouterModel[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

/**
 * Fetch all available models from OpenRouter API
 */
export async function fetchOpenRouterModels(apiKey: string): Promise<OpenRouterModel[]> {
  // Return cached models if still valid
  if (cachedModels && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedModels;
  }

  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }

  const data = await response.json();
  cachedModels = data.data as OpenRouterModel[];
  cacheTimestamp = Date.now();
  
  return cachedModels;
}

/**
 * Get chat models (models that support text generation)
 */
export async function getChatModels(apiKey: string): Promise<ModelInfo[]> {
  const models = await fetchOpenRouterModels(apiKey);
  
  return models
    .filter(m => {
      // Filter out embedding-only models
      const isEmbedding = m.id.includes('embed') || m.architecture?.modality === 'embedding';
      return !isEmbedding && m.context_length > 0;
    })
    .map(m => ({
      id: m.id,
      name: m.name,
      contextLength: m.context_length,
      pricing: `$${parseFloat(m.pricing.prompt) * 1000000}/M in, $${parseFloat(m.pricing.completion) * 1000000}/M out`,
      isChat: true,
      isEmbedding: false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get embedding models
 */
export async function getEmbeddingModels(apiKey: string): Promise<ModelInfo[]> {
  const models = await fetchOpenRouterModels(apiKey);
  
  // Find embedding models
  const embeddingModels = models.filter(m => {
    // Filter embedding models - check multiple conditions
    const idMatch = m.id.toLowerCase().includes('embed');
    const modalityMatch = m.architecture?.modality === 'embedding';
    return idMatch || modalityMatch;
  });
  
  console.log(`🔍 Found ${embeddingModels.length} embedding models from OpenRouter`);
  
  // If OpenRouter doesn't have embedding models, return common OpenAI embeddings
  if (embeddingModels.length === 0) {
    console.log('📝 No embedding models found in OpenRouter, using default list');
    return [
      {
        id: 'openai/text-embedding-3-small',
        name: 'OpenAI text-embedding-3-small',
        contextLength: 8191,
        pricing: '$0.02/M tokens',
        isChat: false,
        isEmbedding: true,
      },
      {
        id: 'openai/text-embedding-3-large',
        name: 'OpenAI text-embedding-3-large',
        contextLength: 8191,
        pricing: '$0.13/M tokens',
        isChat: false,
        isEmbedding: true,
      },
      {
        id: 'openai/text-embedding-ada-002',
        name: 'OpenAI text-embedding-ada-002',
        contextLength: 8191,
        pricing: '$0.10/M tokens',
        isChat: false,
        isEmbedding: true,
      },
    ];
  }
  
  return embeddingModels
    .map(m => ({
      id: m.id,
      name: m.name,
      contextLength: m.context_length,
      pricing: `$${parseFloat(m.pricing.prompt) * 1000000}/M tokens`,
      isChat: false,
      isEmbedding: true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get all models categorized
 */
export async function getAllModels(apiKey: string): Promise<{ chat: ModelInfo[]; embedding: ModelInfo[] }> {
  const [chat, embedding] = await Promise.all([
    getChatModels(apiKey),
    getEmbeddingModels(apiKey),
  ]);
  
  return { chat, embedding };
}

/**
 * Clear the models cache
 */
export function clearModelsCache(): void {
  cachedModels = null;
  cacheTimestamp = 0;
}
