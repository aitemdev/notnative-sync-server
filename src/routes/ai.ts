import { Router, Response } from 'express';
import { z } from 'zod';
import { autocompleteService, AutocompleteRequest } from '../services/autocomplete-service';
import { AuthRequest, authenticateToken } from '../middleware/auth';

const router = Router();

// Validation schema for autocomplete request
const AutocompleteSchema = z.object({
  text: z.string().min(1).max(5000),
  contextAfter: z.string().max(5000).optional(),
  fileName: z.string(),
  relatedNotes: z.array(z.object({
    noteName: z.string(),
    content: z.string()
  })).optional(),
  maxTokens: z.number().int().min(1).max(200).optional(),
  temperature: z.number().min(0).max(2).optional()
});

// POST /api/ai/autocomplete - Generate autocomplete suggestion
router.post('/autocomplete', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    console.log(`[Autocomplete API] Request from userId: ${req.userId}`);

    const autocompleteReq = AutocompleteSchema.parse(req.body);
    console.log(`[Autocomplete API] Text length: ${autocompleteReq.text.length} chars`);
    console.log(`[Autocomplete API] Related notes: ${autocompleteReq.relatedNotes?.length || 0}`);

    const result = await autocompleteService.autocomplete({
      text: autocompleteReq.text,
      contextAfter: autocompleteReq.contextAfter,
      fileName: autocompleteReq.fileName,
      relatedNotes: autocompleteReq.relatedNotes,
      maxTokens: autocompleteReq.maxTokens,
      temperature: autocompleteReq.temperature
    });

    console.log(`[Autocomplete API] Success. Latency: ${result.latency}ms`);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[Autocomplete API] Validation error:', error.errors);
      return res.status(400).json({ error: 'Invalid request format', details: error.errors });
    }

    console.error('[Autocomplete API] Error:', error);
    res.status(500).json({ 
      error: 'Autocomplete failed', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// GET /api/ai/autocomplete/status - Get service status
router.get('/autocomplete/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const status = autocompleteService.getStatus();
    res.json({
      enabled: process.env.AUTOCOMPLETE_ENABLED !== 'false',
      ...status
    });
  } catch (error) {
    console.error('[Autocomplete API] Error getting status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// GET /api/ai/autocomplete/config - Get current configuration
router.get('/autocomplete/config', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    res.json({
      systemPrompt: autocompleteService.getSystemPrompt(),
      maxTokens: parseInt(process.env.AUTOCOMPLETE_MAX_TOKENS || '50'),
      temperature: parseFloat(process.env.AUTOCOMPLETE_TEMPERATURE || '0.7'),
      model: process.env.AUTOCOMPLETE_MODEL || 'Xenova/TinyLlama-1.1B-chat',
      enabled: process.env.AUTOCOMPLETE_ENABLED !== 'false'
    });
  } catch (error) {
    console.error('[Autocomplete API] Error getting config:', error);
    res.status(500).json({ error: 'Failed to get config' });
  }
});

export default router;
