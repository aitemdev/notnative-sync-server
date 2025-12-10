import { Router, Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db';
import { AuthenticatedRequest, authenticate } from '../middleware/auth';

const router = Router();

// Validation schema for user settings
const settingsSchema = z.object({
  openrouterApiKey: z.string().optional(),
  chatModel: z.string().optional(),
  embeddingModel: z.string().optional(),
  braveApiKey: z.string().optional(),
});

// GET /api/settings - Get user settings
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    
    const result = await pool.query(
      'SELECT settings FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return settings or empty object if null
    const settings = result.rows[0].settings || {};
    res.json({ settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/settings - Update user settings
router.put('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const settings = settingsSchema.parse(req.body);
    
    // Update settings in database
    await pool.query(
      'UPDATE users SET settings = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(settings), userId]
    );
    
    res.json({ success: true, settings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid settings format', details: error.errors });
    }
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/settings - Partially update user settings
router.patch('/', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const partialSettings = settingsSchema.partial().parse(req.body);
    
    // Get current settings
    const result = await pool.query(
      'SELECT settings FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Merge with existing settings
    const currentSettings = result.rows[0].settings || {};
    const mergedSettings = { ...currentSettings, ...partialSettings };
    
    // Update settings in database
    await pool.query(
      'UPDATE users SET settings = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(mergedSettings), userId]
    );
    
    res.json({ success: true, settings: mergedSettings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid settings format', details: error.errors });
    }
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
