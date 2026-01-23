import { Router, Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db';
import { AuthRequest, authenticateToken } from '../middleware/auth';

const router = Router();

// Validation schema for user settings
const settingsSchema = z.object({
  openrouterApiKey: z.string().optional(),
  chatModel: z.string().optional(),
  embeddingModel: z.string().optional(),
  braveApiKey: z.string().optional(),
  allowVsCodeCopilotWrapper: z.boolean().optional(),
});

// GET /api/settings - Get user settings
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
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
router.put('/', authenticateToken, async (req: AuthRequest, res: Response) => {
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
router.patch('/', authenticateToken, async (req: AuthRequest, res: Response) => {
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

// GET /api/settings/storage - Get storage usage info
router.get('/storage', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    
    const result = await pool.query(
      'SELECT storage_used, storage_limit FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const used = parseInt(result.rows[0].storage_used, 10);
    const limit = parseInt(result.rows[0].storage_limit, 10);
    const available = Math.max(0, limit - used);
    const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0;
    
    res.json({ 
      used, 
      limit, 
      available, 
      percentage,
      usedFormatted: formatBytes(used),
      limitFormatted: formatBytes(limit),
      availableFormatted: formatBytes(available),
    });
  } catch (error) {
    console.error('Error fetching storage info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default router;
