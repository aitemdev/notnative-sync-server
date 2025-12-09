import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../utils/db';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  deviceId: z.string().min(1),
  deviceName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  deviceId: z.string().min(1),
  deviceName: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

// Helper functions
function generateAccessToken(userId: string, deviceId: string): string {
  const secret = process.env.JWT_SECRET!;
  const expiresIn = process.env.JWT_EXPIRES_IN || '15m';
  
  return jwt.sign({ userId, deviceId }, secret, { expiresIn } as jwt.SignOptions);
}

function generateRefreshToken(userId: string, deviceId: string): string {
  const secret = process.env.JWT_REFRESH_SECRET!;
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  
  return jwt.sign({ userId, deviceId }, secret, { expiresIn } as jwt.SignOptions);
}

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, deviceId, deviceName } = registerSchema.parse(req.body);
    
    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    
    // Create user
    const userResult = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email, passwordHash]
    );
    
    const user = userResult.rows[0];
    
    // Register device
    const deviceResult = await pool.query(
      `INSERT INTO devices (user_id, device_id, device_name, last_sync) 
       VALUES ($1, $2, $3, NOW()) 
       RETURNING id`,
      [user.id, deviceId, deviceName || 'Unknown Device']
    );
    
    const deviceDbId = deviceResult.rows[0].id;
    
    // Generate tokens
    const accessToken = generateAccessToken(user.id, deviceDbId);
    const refreshToken = generateRefreshToken(user.id, deviceDbId);
    
    // Store refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, device_id, token, expires_at) VALUES ($1, $2, $3, $4)',
      [user.id, deviceDbId, refreshToken, expiresAt]
    );
    
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: (error as any).errors });
    }
    
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, deviceId, deviceName } = loginSchema.parse(req.body);
    
    // Find user
    const userResult = await pool.query(
      'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = userResult.rows[0];
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Register or update device
    const deviceResult = await pool.query(
      `INSERT INTO devices (user_id, device_id, device_name, last_sync) 
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, device_id) 
       DO UPDATE SET device_name = $3, last_sync = NOW()
       RETURNING id`,
      [user.id, deviceId, deviceName || 'Unknown Device']
    );
    
    const deviceDbId = deviceResult.rows[0].id;
    
    // Generate tokens
    const accessToken = generateAccessToken(user.id, deviceDbId);
    const refreshToken = generateRefreshToken(user.id, deviceDbId);
    
    // Store refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, device_id, token, expires_at) VALUES ($1, $2, $3, $4)',
      [user.id, deviceDbId, refreshToken, expiresAt]
    );
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: (error as any).errors });
    }
    
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    
    const secret = process.env.JWT_REFRESH_SECRET!;
    
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, secret) as { userId: string; deviceId: string };
    
    // Check if refresh token exists in database
    const tokenResult = await pool.query(
      `SELECT user_id, device_id FROM refresh_tokens 
       WHERE token = $1 AND expires_at > NOW()`,
      [refreshToken]
    );
    
    if (tokenResult.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }
    
    const { user_id, device_id } = tokenResult.rows[0];
    
    // Generate new access token
    const accessToken = generateAccessToken(user_id, device_id);
    
    res.json({ accessToken });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: (error as any).errors });
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }
    
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    
    // Delete refresh token
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: (error as any).errors });
    }
    
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
