import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
  deviceId?: string;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    console.warn('[Auth] No token provided');
    return res.status(401).json({ error: 'Access token required' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('[Auth] JWT secret not configured');
    return res.status(500).json({ error: 'JWT secret not configured' });
  }

  try {
    const decoded = jwt.verify(token, secret) as { userId: string; deviceId: string };
    req.userId = decoded.userId;
    req.deviceId = decoded.deviceId;
    next();
  } catch (error) {
    console.warn('[Auth] Invalid token:', error);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}
