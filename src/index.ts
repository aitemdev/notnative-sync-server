import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth';
import syncRoutes from './routes/sync';
import notesRoutes from './routes/notes';
import attachmentsRoutes from './routes/attachments';
import settingsRoutes from './routes/settings';
import { WebSocketSyncServer } from './websocket/server';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const WS_PORT = parseInt(process.env.WS_PORT || '3001');

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests from this IP, please try again later.',
});

app.use('/api/', limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/attachments', attachmentsRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Error:', err);
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 NotNative Sync Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Start WebSocket server
const wsServer = new WebSocketSyncServer(WS_PORT);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received - closing servers gracefully');
  await wsServer.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received - closing servers gracefully');
  await wsServer.shutdown();
  process.exit(0);
});

export default app;
