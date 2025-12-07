import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { Server } from 'http';
import { NotesDirectory } from '../files/notes-directory';
import { MCP_SERVER_PORT, MCP_SERVER_HOST } from '../../shared/constants';
import type { MCPRequest, MCPResponse } from '../../shared/types/mcp';
import { MCPToolExecutor } from './executor';

export class MCPServer {
  private app: express.Application;
  private server: Server | null = null;
  private db: Database.Database;
  private notesDir: NotesDirectory;
  private executor: MCPToolExecutor;

  constructor(db: Database.Database, notesDir: NotesDirectory) {
    this.db = db;
    this.notesDir = notesDir;
    this.app = express();
    this.executor = new MCPToolExecutor(db, notesDir);
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // List available tools
    this.app.get('/tools', (_, res) => {
      res.json({ tools: this.executor.getToolDefinitions() });
    });

    // JSON-RPC endpoint
    this.app.post('/rpc', async (req, res) => {
      const request = req.body as MCPRequest;

      try {
        // Validate JSON-RPC format
        if (request.jsonrpc !== '2.0') {
          return res.json(this.createErrorResponse(request.id, -32600, 'Invalid JSON-RPC version'));
        }

        if (!request.method) {
          return res.json(this.createErrorResponse(request.id, -32600, 'Method is required'));
        }

        // Execute the tool
        const result = await this.executor.execute(request.method, request.params || {});

        res.json({
          jsonrpc: '2.0',
          id: request.id,
          result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.json(this.createErrorResponse(request.id, -32603, message));
      }
    });

    // RESTful endpoints for common operations
    this.setupRestEndpoints();
  }

  private setupRestEndpoints(): void {
    // Notes
    this.app.get('/notes', async (_, res) => {
      const result = await this.executor.execute('list_notes', {});
      res.json(result);
    });

    this.app.get('/notes/:name', async (req, res) => {
      const result = await this.executor.execute('read_note', { name: req.params.name });
      res.json(result);
    });

    this.app.post('/notes', async (req, res) => {
      const { name, content, folder } = req.body;
      const result = await this.executor.execute('create_note', { name, content, folder });
      res.json(result);
    });

    this.app.put('/notes/:name', async (req, res) => {
      const { content } = req.body;
      const result = await this.executor.execute('update_note', { 
        name: req.params.name, 
        content 
      });
      res.json(result);
    });

    this.app.delete('/notes/:name', async (req, res) => {
      const result = await this.executor.execute('delete_note', { name: req.params.name });
      res.json(result);
    });

    // Search
    this.app.get('/search', async (req, res) => {
      const query = req.query.q as string;
      const result = await this.executor.execute('search_notes', { query });
      res.json(result);
    });

    // Tags
    this.app.get('/tags', async (_, res) => {
      const result = await this.executor.execute('list_tags', {});
      res.json(result);
    });

    // Folders
    this.app.get('/folders', async (_, res) => {
      const result = await this.executor.execute('list_folders', {});
      res.json(result);
    });
  }

  private createErrorResponse(id: string | number, code: number, message: string): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    };
  }

  start(): void {
    if (this.server) {
      console.log('⚠️ MCP Server already running');
      return;
    }

    this.server = this.app.listen(MCP_SERVER_PORT, MCP_SERVER_HOST, () => {
      console.log(`🌐 MCP Server running at http://${MCP_SERVER_HOST}:${MCP_SERVER_PORT}`);
    });

    this.server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${MCP_SERVER_PORT} is already in use`);
      } else {
        console.error('❌ MCP Server error:', error);
      }
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close(() => {
        console.log('🌐 MCP Server stopped');
      });
      this.server = null;
    }
  }

  isRunning(): boolean {
    return this.server !== null;
  }
}
