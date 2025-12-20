import express from 'express';
import { z } from 'zod';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const router = express.Router();

const ExecuteSchema = z.object({
  code: z.string(),
  language: z.enum(['python', 'javascript']).default('python'),
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { code, language } = ExecuteSchema.parse(req.body);
    const authReq = req as AuthRequest;
    console.log(`[Execute] Received ${language} request from user ${authReq.userId}`);

    if (language !== 'python') {
        console.warn(`[Execute] Unsupported language: ${language}`);
        return res.status(400).json({ error: 'Only python is supported for now' });
    }

    // Create a unique temporary directory for this execution
    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const runDir = path.join(os.tmpdir(), runId);
    await fs.mkdir(runDir, { recursive: true });
    console.log(`[Execute] Created temp dir: ${runDir}`);

    const fileName = 'script.py';
    const filePath = path.join(runDir, fileName);

    await fs.writeFile(filePath, code);

    // Execute the script
    // Timeout after 10 seconds
    // Use python3 by default, fallback to python if needed (or assume environment is set up)
    // If running in Docker or with venv, ensure we use the venv python
    let pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
    
    // Check if we are in the docker container or have a venv setup
    const venvPython = path.join(process.cwd(), 'venv', 'bin', 'python');
    const dockerVenvPython = '/app/venv/bin/python';
    
    try {
        // Check for Docker venv
        await fs.access(dockerVenvPython);
        pythonCommand = dockerVenvPython;
        console.log(`[Execute] Using Docker venv python: ${pythonCommand}`);
    } catch {
        try {
            // Check for local venv
            await fs.access(venvPython);
            pythonCommand = venvPython;
            console.log(`[Execute] Using local venv python: ${pythonCommand}`);
        } catch {
            console.log(`[Execute] Using system python: ${pythonCommand}`);
        }
    }
    
    // Execute with cwd set to the runDir so generated files appear there
    exec(`${pythonCommand} "${fileName}"`, { timeout: 10000, cwd: runDir }, async (error, stdout, stderr) => {
      if (stdout) console.log(`[Execute] Stdout: ${stdout.substring(0, 500)}${stdout.length > 500 ? '...' : ''}`);
      if (stderr) console.error(`[Execute] Stderr: ${stderr}`);

      // Check for generated images
      const images: { name: string; data: string }[] = [];
      try {
        const files = await fs.readdir(runDir);
        for (const file of files) {
            if (file === fileName) continue; // Skip script itself
            
            const ext = path.extname(file).toLowerCase();
            if (['.png', '.jpg', '.jpeg', '.svg', '.gif'].includes(ext)) {
                console.log(`[Execute] Found generated image: ${file}`);
                const fileContent = await fs.readFile(path.join(runDir, file));
                images.push({
                    name: file,
                    data: fileContent.toString('base64')
                });
            }
        }
      } catch (e) {
        console.error('[Execute] Error reading generated files:', e);
      }

      // Clean up directory
      try {
        await fs.rm(runDir, { recursive: true, force: true });
        console.log(`[Execute] Cleaned up temp dir: ${runDir}`);
      } catch (e) {
        console.error('[Execute] Failed to delete temp dir:', e);
      }

      if (error) {
        console.error(`[Execute] Execution error: ${error.message}`);
        // If it's a timeout
        if (error.killed) {
             return res.json({ 
                success: false, 
                error: 'Execution timed out', 
                stdout, 
                stderr,
                images
            });
        }
        
        return res.json({
          success: false,
          error: error.message,
          stdout,
          stderr,
          images
        });
      }

      console.log(`[Execute] Success. Returned ${images.length} images.`);
      res.json({
        success: true,
        stdout,
        stderr,
        images
      });
    });

  } catch (error) {
    console.error('[Execute] Catch error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
