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

      // Check for generated files
      const generatedFiles: { name: string; data: string; type: 'image' | 'file' }[] = [];
      try {
        // Recursive function to get all files
        const getFilesRecursively = async (dir: string): Promise<string[]> => {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          const files: string[] = [];
          for (const entry of entries) {
            const res = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              files.push(...(await getFilesRecursively(res)));
            } else {
              files.push(res);
            }
          }
          return files;
        };

        const files = await getFilesRecursively(runDir);
        
        for (const filePath of files) {
            const relativePath = path.relative(runDir, filePath);
            if (relativePath === fileName) continue; // Skip script itself
            
            // Skip __pycache__ or hidden files
            if (relativePath.includes('__pycache__') || path.basename(filePath).startsWith('.')) continue;

            try {
                const ext = path.extname(filePath).toLowerCase();
                const fileContent = await fs.readFile(filePath);
                const base64Data = fileContent.toString('base64');
                // Use basename for the name to flatten structure for client, 
                // OR keep relative path if we want to preserve structure?
                // The client does path.join(saveDir, file.name). 
                // If file.name has separators, it might try to write to subdirs which don't exist.
                // It is safer to flatten for now, or ensure client creates dirs.
                // Given the issue is "file not found", getting it at all is priority.
                // Let's use basename to ensure it saves to the assets folder directly.
                // BUT wait, if the markdown refers to "Assets/file.png", and we save as "file.png" in "Assets", it works?
                // The markdown path "Enero 2026.assets/grafico.png" implies it expects it inside that folder.
                // If we save it as "grafico.png" inside "note.assets", it IS "note.assets/grafico.png".
                // So flattening is CORRECT for the client's current logic.
                const name = path.basename(filePath);
                
                if (['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'].includes(ext)) {
                    console.log(`[Execute] Found generated image: ${name} (from ${relativePath})`);
                    generatedFiles.push({
                        name: name,
                        data: base64Data,
                        type: 'image'
                    });
                } else {
                    console.log(`[Execute] Found generated file: ${name} (from ${relativePath})`);
                    generatedFiles.push({
                        name: name,
                        data: base64Data,
                        type: 'file'
                    });
                }
            } catch (readErr) {
                console.warn(`[Execute] Skipped file ${relativePath} due to read error:`, readErr);
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
                images: generatedFiles.filter(f => f.type === 'image'),
                files: generatedFiles
            });
        }
        
        return res.json({
          success: false,
          error: error.message,
          stdout,
          stderr,
          images: generatedFiles.filter(f => f.type === 'image'),
          files: generatedFiles
        });
      }

      console.log(`[Execute] Success. Returned ${generatedFiles.length} files.`);
      res.json({
        success: true,
        stdout,
        stderr,
        images: generatedFiles.filter(f => f.type === 'image'),
        files: generatedFiles
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
