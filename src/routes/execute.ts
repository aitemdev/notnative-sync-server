import express from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
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

    if (language !== 'python') {
        return res.status(400).json({ error: 'Only python is supported for now' });
    }

    // Create a unique temporary directory for this execution
    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const runDir = path.join(os.tmpdir(), runId);
    await fs.mkdir(runDir, { recursive: true });

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
    } catch {
        try {
            // Check for local venv
            await fs.access(venvPython);
            pythonCommand = venvPython;
        } catch {
            // Fallback to system python
        }
    }
    
    // Execute with cwd set to the runDir so generated files appear there
    exec(`${pythonCommand} "${fileName}"`, { timeout: 10000, cwd: runDir }, async (error, stdout, stderr) => {
      
      // Check for generated images
      const images: { name: string; data: string }[] = [];
      try {
        const files = await fs.readdir(runDir);
        for (const file of files) {
            if (file === fileName) continue; // Skip script itself
            
            const ext = path.extname(file).toLowerCase();
            if (['.png', '.jpg', '.jpeg', '.svg', '.gif'].includes(ext)) {
                const fileContent = await fs.readFile(path.join(runDir, file));
                images.push({
                    name: file,
                    data: fileContent.toString('base64')
                });
            }
        }
      } catch (e) {
        console.error('Error reading generated files:', e);
      }

      // Clean up directory
      try {
        await fs.rm(runDir, { recursive: true, force: true });
      } catch (e) {
        console.error('Failed to delete temp dir:', e);
      }

      if (error) {
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

      res.json({
        success: true,
        stdout,
        stderr,
        images
      });
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
