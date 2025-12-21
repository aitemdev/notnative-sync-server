import { Router, Request, Response } from 'express';
import { z } from 'zod';

const router = Router();

// Validation schema
const speakSchema = z.object({
  text: z.string().min(1),
  language: z.string().default('es'),
});

// Helper for dynamic import (to load ESM module in CJS environment)
const dynamicImport = new Function('specifier', 'return import(specifier)');

// TTS Synthesizer Singleton (Map of language -> synthesizer)
const synthesizers = new Map<string, any>();

// POST /api/ai/speak
router.post('/speak', async (req: Request, res: Response) => {
  try {
    const { text, language } = speakSchema.parse(req.body);
    
    console.log(`🗣️ Generating speech for: "${text.slice(0, 50)}..." (${language})`);

    // Determine model based on language
    // 'es' -> 'Xenova/mms-tts-spa'
    // 'en' -> 'Xenova/mms-tts-eng'
    const modelId = language.startsWith('en') ? 'Xenova/mms-tts-eng' : 'Xenova/mms-tts-spa';
    
    let synthesizer = synthesizers.get(modelId);

    if (!synthesizer) {
      console.log(`🚀 Loading TTS model: ${modelId}...`);
      
      // Dynamically load pipeline from @xenova/transformers
      const { pipeline } = await dynamicImport('@xenova/transformers');
      
      synthesizer = await pipeline('text-to-speech', modelId, {
        quantized: true,
      });
      synthesizers.set(modelId, synthesizer);
      console.log(`✅ TTS model loaded: ${modelId}`);
    }

    const output = await synthesizer(text);
    
    // Output is { audio: Float32Array, sampling_rate: number }
    // Convert Float32Array to regular array for JSON serialization
    const audioArray = Array.from(output.audio as Float32Array);

    res.json({
      audio: audioArray,
      sampling_rate: output.sampling_rate
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: (error as any).errors });
    }
    
    console.error('❌ TTS Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
