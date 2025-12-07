import { ipcMain, BrowserWindow } from 'electron';
import Database from 'better-sqlite3';
import { IPC_CHANNELS } from '../../shared/types/ipc';
import { NotesDirectory } from '../files/notes-directory';
import { getAIClient, initAIClient, ChatOptions, ChatMessage as AIMessage } from '../ai/client';
import { createToolContext } from '../ai/context';
import { createAllTools } from '../ai/tools';
import type { ChatMessage, ChatSession } from '../../shared/types';
import { getApiKey } from '../settings/store';

// Store for active stream aborts
const activeStreams = new Map<number, AbortController>();

// In-memory sessions (TODO: persist to SQLite)
const sessions = new Map<number, {
  session: ChatSession;
  messages: ChatMessage[];
}>();

let nextSessionId = 1;
let nextMessageId = 1;

export function registerAIHandlers(
  db: Database.Database, 
  notesDir: NotesDirectory,
  getMainWindow: () => BrowserWindow | null
): void {
  // Create tool context with window reference for notifications
  const toolContext = createToolContext(db, notesDir, getMainWindow);
  const tools = createAllTools(toolContext);

  // Initialize AI client with API key from settings (with env fallback)
  const apiKey = getApiKey();
  if (apiKey) {
    initAIClient(apiKey);
    console.log('✅ AI Client initialized');
  } else {
    console.warn('⚠️ No API key configured - AI features will not work until you add one in settings');
  }

  // ============== SEND MESSAGE ==============
  ipcMain.handle(IPC_CHANNELS['ai:send-message'], async (
    _event,
    sessionId: number | null,
    userMessage: string,
    options?: Partial<ChatOptions>
  ) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      throw new Error('Main window not available');
    }

    const aiClient = getAIClient();
    if (!aiClient) {
      throw new Error('AI client not initialized. Please configure your OpenRouter API key in settings.');
    }

    // Create or get session
    let session: ChatSession;
    let messages: ChatMessage[];
    
    if (sessionId && sessions.has(sessionId)) {
      const existing = sessions.get(sessionId)!;
      session = existing.session;
      messages = existing.messages;
    } else {
      // Create new session
      session = {
        id: nextSessionId++,
        createdAt: new Date(),
        updatedAt: new Date(),
        model: options?.model || 'openai/gpt-4o-mini',
        provider: 'openrouter',
        temperature: options?.temperature || 0.7,
        maxTokens: options?.maxTokens || 4096,
      };
      messages = [];
      sessions.set(session.id, { session, messages });
    }

    // Add user message
    const userMsg: ChatMessage = {
      id: nextMessageId++,
      sessionId: session.id,
      role: 'user',
      content: userMessage,
      createdAt: new Date(),
    };
    messages.push(userMsg);

    // Create abort controller for cancellation
    const abortController = new AbortController();
    activeStreams.set(session.id, abortController);

    try {
      // Build messages for API with system prompt
      const systemPrompt: AIMessage = {
        role: 'system',
        content: `You are a helpful AI assistant integrated into NotNative, a note-taking application. 
You help users manage their notes, search for information, create content, and answer questions.

IMPORTANT RULES:
- ALWAYS respond in the SAME LANGUAGE the user writes to you. If they write in Spanish, respond in Spanish. If they write in English, respond in English.
- Be thorough and helpful in your responses. When the user asks for information, provide comprehensive answers based on what you find.
- When the user mentions a note with @notename (e.g., "@test", "@My Note"), the @ symbol is ONLY for reference - the actual note name does NOT include the @. So "@test" means the note named "test", not "@test".
- When the user asks you to modify, update, or add content to a note, use the update_note tool directly with the new content. Don't just search first.
- When asked to create a note with specific content, use create_note with full content in one call.
- When asked to clean/clear a note and add new content, use update_note with the complete new content.
- Format your responses using Markdown when appropriate (headers, lists, bold, code blocks, etc.).
- After completing an action, briefly confirm what you did.

SEARCH TOOLS - TWO-STEP APPROACH:
1. First use "semantic_search" to find relevant notes about a TOPIC or CONCEPT. This searches by meaning/similarity using AI embeddings.
2. After finding relevant notes, use "read_note" to read the FULL CONTENT of the most relevant note(s) to get complete information.
3. Only use "search_notes" for exact keyword matching when semantic search doesn't work.

CRITICAL - ALWAYS FOLLOW THIS WORKFLOW:
1. When user asks about a topic → Use semantic_search first
2. Look at the results and identify the most relevant note(s) with highest similarity %
3. Use read_note to get the COMPLETE content of those notes
4. Then provide a comprehensive answer based on the full content

WHEN PRESENTING RESULTS:
- NEVER just show raw search results. ALWAYS read the full notes and synthesize the information.
- Answer the user's question directly using the information you found.
- Explain what you found in your own words with specific details from the notes.
- Always cite sources using [[note name]] format so users can click to open the note.
- If the user asks "what does my note say about X", READ the note first and EXPLAIN the content.`,
      };

      const apiMessages: AIMessage[] = [
        systemPrompt,
        ...messages.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
      ];

      // Stream the response
      let fullContent = '';
      const toolCallsInfo: Array<{ id: string; name: string; args: Record<string, unknown>; result: unknown }> = [];

      console.log('🤖 Starting AI stream...');
      
      const result = await aiClient.streamChat(apiMessages, tools, {
        model: session.model,
        temperature: session.temperature,
        maxTokens: session.maxTokens,
      });

      // Handle streaming - result is a StreamTextResult
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textResult = result as any;
      
      console.log('🤖 Stream result keys:', Object.keys(textResult || {}));
      
      // Process text stream
      if (textResult && 'textStream' in textResult) {
        try {
          for await (const chunk of textResult.textStream) {
            if (abortController.signal.aborted) break;
            
            fullContent += chunk;
            mainWindow.webContents.send(IPC_CHANNELS['ai:stream-chunk'], {
              sessionId: session.id,
              chunk,
              fullContent,
            });
          }
        } catch (streamError) {
          console.error('🤖 Stream error:', streamError);
          throw streamError;
        }
      }
      
      // Check for tool calls and their results
      if (textResult && 'toolCalls' in textResult) {
        try {
          const calls = await textResult.toolCalls;
          console.log('🤖 Tool calls:', calls);
          for (const call of calls || []) {
            toolCallsInfo.push({
              id: call.toolCallId || `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              name: call.toolName,
              args: (call.args as Record<string, unknown>) || {},
              result: null,
            });
          }
        } catch (e) {
          console.log('🤖 No tool calls or error:', e);
        }
      }

      // Check for tool results  
      if (textResult && 'toolResults' in textResult) {
        try {
          const results = await textResult.toolResults;
          console.log('🤖 Tool results:', results);
          for (let i = 0; i < (results || []).length; i++) {
            const toolResult = results[i];
            // The SDK uses 'output' not 'result'
            const output = toolResult.output || toolResult.result;
            if (toolCallsInfo[i]) {
              toolCallsInfo[i].result = output;
            }
            // Add tool result to content if no text was generated
            if (!fullContent && output) {
              fullContent += `${output}\n`;
            }
          }
        } catch (e) {
          console.log('🤖 No tool results or error:', e);
        }
      }

      // If still no content, try to get the final text
      if (!fullContent && textResult && 'text' in textResult) {
        try {
          const finalText = await textResult.text;
          if (finalText) {
            fullContent = finalText;
          }
          console.log('🤖 Got text from result:', fullContent.length);
        } catch (e) {
          console.log('🤖 No text property');
        }
      }

      // If we had tool calls but no content, create a summary from tool outputs
      if (!fullContent && toolCallsInfo.length > 0) {
        fullContent = toolCallsInfo.map(tc => {
          const resultStr = typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result);
          return `**${tc.name}**:\n${resultStr}`;
        }).join('\n\n');
      }
      
      // Fallback message if still empty
      if (!fullContent) {
        fullContent = 'La operación se completó pero no se generó respuesta.';
      }
      
      console.log('🤖 Final content length:', fullContent.length);
      console.log('🤖 Tool calls count:', toolCallsInfo.length);

      // Send final content if it was built from tool results
      if (fullContent && toolCallsInfo.length > 0) {
        mainWindow.webContents.send(IPC_CHANNELS['ai:stream-chunk'], {
          sessionId: session.id,
          chunk: fullContent,
          fullContent,
        });
      }

      // Create assistant message
      const assistantMsg: ChatMessage = {
        id: nextMessageId++,
        sessionId: session.id,
        role: 'assistant',
        content: fullContent || 'La acción se completó pero no hubo respuesta de texto.',
        createdAt: new Date(),
        toolCalls: toolCallsInfo.length > 0 ? toolCallsInfo : undefined,
      };
      messages.push(assistantMsg);

      // Update session
      session.updatedAt = new Date();

      // Send completion
      mainWindow.webContents.send(IPC_CHANNELS['ai:stream-end'], {
        sessionId: session.id,
        message: assistantMsg,
      });

      return {
        sessionId: session.id,
        message: assistantMsg,
      };

    } catch (error) {
      console.error('🤖 AI Error:', error);
      // Send error
      mainWindow.webContents.send(IPC_CHANNELS['ai:stream-error'], {
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      activeStreams.delete(session.id);
    }
  });

  // ============== CANCEL STREAM ==============
  ipcMain.handle(IPC_CHANNELS['ai:cancel'], async (_, sessionId: number) => {
    const controller = activeStreams.get(sessionId);
    if (controller) {
      controller.abort();
      activeStreams.delete(sessionId);
    }
  });

  // ============== GET SESSIONS ==============
  ipcMain.handle(IPC_CHANNELS['ai:get-sessions'], async () => {
    return Array.from(sessions.values())
      .map(s => s.session)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  });

  // ============== GET MESSAGES ==============
  ipcMain.handle(IPC_CHANNELS['ai:get-messages'], async (_, sessionId: number) => {
    const data = sessions.get(sessionId);
    if (!data) return [];
    return data.messages;
  });

  // ============== DELETE SESSION ==============
  ipcMain.handle(IPC_CHANNELS['ai:delete-session'], async (_, sessionId: number) => {
    sessions.delete(sessionId);
    
    // Cancel any active stream
    const controller = activeStreams.get(sessionId);
    if (controller) {
      controller.abort();
      activeStreams.delete(sessionId);
    }
  });

  console.log('✅ AI IPC handlers registered');
}
