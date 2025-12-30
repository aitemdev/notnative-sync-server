// Dynamic import for ESM module
let pipeline: any = null;
let env: any = null;

// Configuration
const SYSTEM_PROMPT = `You are a helpful writing assistant for NotNative, a note-taking application with smart variables, formulas, wikilinks, and canvas capabilities.

Your task is to complete user's text naturally and intelligently based on provided context.

INSTRUCTIONS:
- Continue EXACTLY where user left off
- Do NOT repeat last words of the input
- Do NOT start with capital letter unless it's a new sentence
- Be concise (max 1-2 sentences)
- Use the SAME LANGUAGE as the input (Spanish/English)
- You MAY suggest wikilinks like [[Note Name]] if the context refers to an existing note found in the "Context from other notes" section
- You MAY suggest tags like #tag if it is appropriate for the content
- You MAY suggest smart variables like [name: value] or formulas like {{ expression }} if the context suggests it
- Return ONLY the suggested text to complete the thought
- Do not output markdown code blocks, just the raw text
- If no clear completion is possible, return an empty string`;

const MAX_TOKENS = parseInt(process.env.AUTOCOMPLETE_MAX_TOKENS || '50');
const DEFAULT_TEMPERATURE = parseFloat(process.env.AUTOCOMPLETE_TEMPERATURE || '0.7');

interface RelatedNote {
  noteName: string;
  content: string;
}

interface AutocompleteRequest {
  text: string;
  contextAfter?: string;
  fileName: string;
  relatedNotes?: RelatedNote[];
  maxTokens?: number;
  temperature?: number;
}

interface AutocompleteResponse {
  suggestion: string;
  model: string;
  latency: number;
  tokensGenerated: number;
}

class AutocompleteService {
  private generator: any = null;
  private modelLoaded = false;
  private isLoading = false;
  private readonly modelName = process.env.AUTOCOMPLETE_MODEL || 'Xenova/TinyLlama-1.1B-chat';
  private requestCount = 0;
  private totalLatency = 0;
  private errorCount = 0;

  private async loadTransformers(): Promise<void> {
    if (pipeline && env) {
      console.log('[Autocomplete] Transformers already loaded');
      return;
    }

    try {
      const transformers = await import('@xenova/transformers');
      pipeline = (transformers as any).pipeline;
      env = (transformers as any).env;

      // Configure environment
      if (env) {
        (env as any).allowLocalModels = false;
        (env as any).useBrowserCache = false;
      }

      console.log('[Autocomplete] Transformers loaded successfully');
    } catch (error) {
      console.error('[Autocomplete] Failed to load transformers:', error);
      throw error;
    }
  }

  async initialize(): Promise<void> {
    if (this.modelLoaded || this.isLoading) {
      return;
    }

    this.isLoading = true;
    const startTime = Date.now();

    // Load transformers module dynamically (ESM support)
    await this.loadTransformers();

    console.log(`[Autocomplete] Loading model: ${this.modelName}...`);

    try {
      this.generator = await pipeline('text-generation', this.modelName, {
        quantized: true,
        progress_callback: (progress: any) => {
          if (progress.status === 'progress') {
            const percent = Math.round(progress.progress * 100);
            if (percent % 20 === 0) {
              console.log(`[Autocomplete] Loading: ${percent}%`);
            }
          }
        }
      });

      this.modelLoaded = true;
      const loadTime = Date.now() - startTime;
      console.log(`[Autocomplete] Model loaded in ${loadTime}ms`);
      console.log(`[Autocomplete] Model ready for inference`);
    } catch (error) {
      console.error('[Autocomplete] Failed to load model:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  isReady(): boolean {
    return this.modelLoaded;
  }

  private buildPrompt(req: AutocompleteRequest): string {
    let prompt = '';

    if (req.relatedNotes && req.relatedNotes.length > 0) {
      const notesContext = req.relatedNotes
        .map(n => `Note: ${n.noteName}\nContent: ${n.content}`)
        .join('\n\n');
      prompt += `Context from other notes:\n${notesContext}\n\n`;
    }

    prompt += `Current file: ${req.fileName}\n`;
    prompt += `Content before cursor (COMPLETE THIS):\n${req.text}\n\n`;
    prompt += `Content after cursor:\n${req.contextAfter || ''}`;

    return prompt;
  }

  async autocomplete(req: AutocompleteRequest): Promise<AutocompleteResponse> {
    const startTime = Date.now();
    this.requestCount++;

    console.log(`[Autocomplete] Request #${this.requestCount} from user`);
    console.log(`[Autocomplete] Input length: ${req.text.length} chars`);

    if (!this.isReady()) {
      console.warn('[Autocomplete] Model not ready, initializing...');
      await this.initialize();
    }

    const prompt = this.buildPrompt(req);

    try {
      console.log(`[Autocomplete] Generating completion (maxTokens: ${req.maxTokens || MAX_TOKENS})...`);

      const result = await this.generator(prompt, {
        max_new_tokens: req.maxTokens || MAX_TOKENS,
        temperature: req.temperature ?? DEFAULT_TEMPERATURE,
        do_sample: true,
        top_p: 0.9,
        repetition_penalty: 1.2,
        return_full_text: false
      });

      const generatedText = result[0]?.generated_text || '';
      const latency = Date.now() - startTime;
      this.totalLatency += latency;

      console.log(`[Autocomplete] Generated "${generatedText}"`);
      console.log(`[Autocomplete] Output length: ${generatedText.length} chars`);
      console.log(`[Autocomplete] Latency: ${latency}ms`);
      console.log(`[Autocomplete] Avg latency: ${Math.round(this.totalLatency / this.requestCount)}ms`);

      return {
        suggestion: generatedText.trim() || '',
        model: this.modelName,
        latency,
        tokensGenerated: this.estimateTokens(generatedText)
      };
    } catch (error) {
      this.errorCount++;
      console.error('[Autocomplete] Generation failed:', error);
      throw error;
    }
  }

  getSystemPrompt(): string {
    return SYSTEM_PROMPT;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  getStatus(): any {
    return {
      modelLoaded: this.modelLoaded,
      isLoading: this.isLoading,
      modelName: this.modelName,
      requestCount: this.requestCount,
      totalLatency: this.totalLatency,
      avgLatency: this.requestCount > 0 ? Math.round(this.totalLatency / this.requestCount) : 0,
      errorCount: this.errorCount
    };
  }
}

const autocompleteService = new AutocompleteService();

export { autocompleteService, AutocompleteService, AutocompleteRequest, AutocompleteResponse, RelatedNote };
