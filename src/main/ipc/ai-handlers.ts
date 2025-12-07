import { ipcMain, BrowserWindow } from 'electron';
import Database from 'better-sqlite3';
import { IPC_CHANNELS } from '../../shared/types/ipc';
import { NotesDirectory } from '../files/notes-directory';
import { getAIClient, initAIClient, ChatOptions, ChatMessage as AIMessage } from '../ai/client';
import { createToolContext } from '../ai/context';
import { createAllTools } from '../ai/tools/index.js';
import type { ChatMessage, ChatSession } from '../../shared/types';
import { getApiKey, getBraveApiKey, setBraveApiKey } from '../settings/store';

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
        content: `You are an intelligent AI agent integrated into NotNative, a note-taking application. You help users manage their notes, search for information, create content, and answer questions.

## CORE BEHAVIOR - YOU ARE AN AGENT, NOT A SIMPLE TOOL
You MUST act as an autonomous agent that completes tasks end-to-end. NEVER just return tool results - always process them and provide a helpful final answer.

## LANGUAGE RULE
ALWAYS respond in the SAME LANGUAGE the user writes to you. If they write in Spanish, respond in Spanish. If in English, respond in English.

## NOTE REFERENCE FORMAT
When a user mentions @notename (e.g., "@test"), the @ is just a reference marker - the actual note name is "test", not "@test".

## CRITICAL: MULTI-STEP WORKFLOW FOR SEARCHES
When asked to find information, ALWAYS follow these steps:

1. **STEP 1 - Search**: Use \`semantic_search\` to find relevant notes about the topic
2. **STEP 2 - Read**: Look at search results, identify the most relevant notes (highest similarity %), then use \`read_note\` to get the FULL content
3. **STEP 3 - Answer**: Synthesize the information and provide a comprehensive answer in your own words

EXAMPLE:
- User asks: "What do my notes say about React hooks?"
- You: First call semantic_search("React hooks")
- You get results showing "dev-notes" has 78% relevance
- You: Call read_note("dev-notes") to get full content
- You: Finally explain what the notes say about React hooks, citing [[dev-notes]]

## NEVER DO THIS:
❌ Return raw search results without reading the notes
❌ Say "I found X notes" without explaining what's in them
❌ Stop after a tool call without synthesizing information
❌ Ask the user to read notes themselves

## ALWAYS DO THIS:
✅ Complete the full workflow autonomously
✅ Read the actual note content before answering
✅ Provide specific details and insights from the notes
✅ Cite sources using [[note name]] format
✅ Give comprehensive, helpful answers

## AVAILABLE TOOLS (CALL THEM DIRECTLY)
Notes:
- \`search_notes\`: full-text search by keywords
- \`semantic_search\`: semantic search by meaning (use first when looking for info)
- \`list_notes\`: list notes (optionally by folder)
- \`read_note\`: read a note by exact name
- \`create_note\`: create note (with optional folder)
- \`update_note\`: replace entire note content
- \`append_to_note\`: append content to a note
- \`move_note\`: move a note to another folder
- \`rename_note\`: rename a note
- \`delete_note\`: move note to trash

Folders:
- \`list_folders\`, \`create_folder\`, \`delete_folder\`, \`rename_folder\`, \`move_folder\`

Tags:
- \`list_tags\`, \`create_tag\`, \`delete_tag\`, \`add_tag_to_note\`, \`remove_tag_from_note\`, \`get_notes_by_tag\`

Embeddings:
- \`semantic_search\` (see above)

System:
- \`get_app_info\`, \`list_models\`, etc. (utility/diagnostic)

Web:
- \`web_search\`: quick web lookup (DuckDuckGo JSON). Use only when local notes/tools are insufficient.

## MODIFICATION TOOLS
- Use \`update_note\` to replace entire note content
- Use \`append_to_note\` to add content at the end
- Use \`create_note\` to create new notes
- Use \`move_note\` / \`move_folder\` for organization
- After modifications, briefly confirm what you did

## CONFIRMATION FOR DESTRUCTIVE ACTIONS
- BEFORE executing delete, move, or rename operations (notes or folders), ask for a brief confirmation unless the user explicitly requested that exact action.
- When asking, show a concise preview of what will change (e.g., source -> destination).

## RESPONSE FORMAT
- Use Markdown formatting (headers, lists, bold, code blocks)
- Be thorough and helpful
- Explain your findings in your own words with specific details`,
      };

      // Build conversation messages
      const apiMessages: AIMessage[] = [
        systemPrompt,
        ...messages.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
      ];

      // Variables for tracking the response
      let fullContent = '';
      const allToolCalls: Array<{ id: string; name: string; args: Record<string, unknown>; result: unknown }> = [];
      let stepCount = 0;

      console.log('🤖 Starting AI stream with multi-step support (stopWhen)...');

      // Use streamChat which now has stopWhen: stepCountIs(10) built-in
      const result = await aiClient.streamChat(apiMessages, tools, {
        model: session.model,
        temperature: session.temperature,
        maxTokens: session.maxTokens,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const streamResult = result as any;
      
      console.log('🤖 Stream result type:', typeof streamResult);
      console.log('🤖 Stream result keys:', Object.keys(streamResult || {}));
      console.log('🤖 Has fullStream:', 'fullStream' in streamResult);
      console.log('🤖 Has textStream:', 'textStream' in streamResult);

      // In v5, streamText returns an object with fullStream property
      // Try to get fullStream directly
      const fullStream = streamResult.fullStream;
      
      if (fullStream) {
        console.log('🤖 Processing fullStream...');
        try {
          for await (const event of fullStream) {
            if (abortController.signal.aborted) break;
            
            console.log('🤖 Event type:', event.type);
            
            switch (event.type) {
              case 'start-step':
                stepCount++;
                console.log(`🤖 Step ${stepCount} started`);
                mainWindow.webContents.send(IPC_CHANNELS['ai:stream-chunk'], {
                  sessionId: session.id,
                  chunk: '',
                  fullContent,
                  stepInfo: { step: stepCount, status: 'started' },
                });
                break;
                
              case 'text-delta':
                // In v5, the text delta might be in different properties
                const textChunk = event.textDelta ?? event.delta ?? event.text ?? '';
                if (stepCount === 1 && fullContent.length === 0) {
                  console.log('🤖 First text-delta event:', JSON.stringify(event));
                }
                fullContent += textChunk;
                mainWindow.webContents.send(IPC_CHANNELS['ai:stream-chunk'], {
                  sessionId: session.id,
                  chunk: textChunk,
                  fullContent,
                });
                break;
                
              case 'tool-call':
                console.log(`🤖 Tool call: ${event.toolName}`, event.args);
                allToolCalls.push({
                  id: event.toolCallId || `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  name: event.toolName,
                  args: (event.args as Record<string, unknown>) || {},
                  result: null,
                });
                mainWindow.webContents.send(IPC_CHANNELS['ai:stream-chunk'], {
                  sessionId: session.id,
                  chunk: '',
                  fullContent,
                  toolCall: { name: event.toolName, args: event.args },
                });
                break;
                
              case 'tool-result':
                console.log(`🤖 Tool result for: ${event.toolName}`);
                const toolCall = allToolCalls.find(tc => tc.id === event.toolCallId);
                if (toolCall) {
                  toolCall.result = event.result;
                }
                mainWindow.webContents.send(IPC_CHANNELS['ai:stream-chunk'], {
                  sessionId: session.id,
                  chunk: '',
                  fullContent,
                  toolResult: { name: event.toolName, result: event.result },
                });
                break;
                
              case 'finish-step':
                console.log(`🤖 Step ${stepCount} finished, reason: ${event.finishReason}`);
                break;
                
              case 'finish':
                console.log(`🤖 Stream finished after ${stepCount} steps`);
                break;
            }
          }
        } catch (streamError) {
          console.error('🤖 Stream error:', streamError);
          throw streamError;
        }
      } else if (streamResult && streamResult.textStream) {
        // Fallback to simple textStream
        console.log('🤖 Fallback to textStream...');
        try {
          for await (const chunk of streamResult.textStream) {
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
      } else {
        console.error('🤖 No stream available!');
      }

      // Fallback message if still empty
      if (!fullContent.trim()) {
        fullContent = 'La operación se completó pero no se generó respuesta de texto.';
      }
      
      console.log('🤖 Stream finished:');
      console.log('🤖 Final content length:', fullContent.length);
      console.log('🤖 Total tool calls:', allToolCalls.length);
      console.log('🤖 Total steps:', stepCount);

      // Create assistant message
      const assistantMsg: ChatMessage = {
        id: nextMessageId++,
        sessionId: session.id,
        role: 'assistant',
        content: fullContent || 'La acción se completó pero no hubo respuesta de texto.',
        createdAt: new Date(),
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
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

  // ============== BRAVE API KEY ==============
  ipcMain.handle(IPC_CHANNELS['ai:get-brave-api-key'], async () => {
    const key = getBraveApiKey();
    if (!key) return { hasKey: false, maskedKey: '' };
    const masked = key.length > 8 ? key.slice(0, 4) + '...' + key.slice(-4) : '••••';
    return { hasKey: true, maskedKey: masked };
  });

  ipcMain.handle(IPC_CHANNELS['ai:set-brave-api-key'], async (_event, apiKey: string) => {
    try {
      setBraveApiKey(apiKey);
      return { success: true };
    } catch (error) {
      console.error('Failed to set Brave API key:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  console.log('✅ AI IPC handlers registered');
}
