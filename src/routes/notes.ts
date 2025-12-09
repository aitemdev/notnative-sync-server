import { Router, Response } from 'express';
import { z } from 'zod';
import { pool } from '../utils/db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/notes - List all notes for user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    
    const result = await pool.query(
      `SELECT uuid, name, path, folder, order_index, icon, icon_color, 
              created_at, updated_at, deleted_at
       FROM notes
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY updated_at DESC`,
      [userId]
    );
    
    res.json({ notes: result.rows });
  } catch (error) {
    console.error('List notes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notes/:uuid - Get specific note with content
router.get('/:uuid', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { uuid } = req.params;
    
    const result = await pool.query(
      `SELECT uuid, name, path, folder, content, order_index, icon, icon_color,
              created_at, updated_at, deleted_at
       FROM notes
       WHERE user_id = $1 AND uuid = $2`,
      [userId, uuid]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    res.json({ note: result.rows[0] });
  } catch (error) {
    console.error('Get note error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/notes/:uuid - Delete note
router.delete('/:uuid', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { uuid } = req.params;
    
    const result = await pool.query(
      `UPDATE notes SET deleted_at = EXTRACT(EPOCH FROM NOW()) * 1000
       WHERE user_id = $1 AND uuid = $2
       RETURNING uuid`,
      [userId, uuid]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    
    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
