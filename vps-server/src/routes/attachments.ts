import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// TODO: Implement S3/MinIO integration for file uploads/downloads
// For now, just placeholder endpoints

// POST /api/attachments - Upload attachment
router.post('/', async (req: AuthRequest, res: Response) => {
  res.status(501).json({ error: 'Attachment upload not yet implemented' });
});

// GET /api/attachments/:hash - Download attachment
router.get('/:hash', async (req: AuthRequest, res: Response) => {
  res.status(501).json({ error: 'Attachment download not yet implemented' });
});

export default router;
