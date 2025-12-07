// MCP (Model Context Protocol) Types

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, MCPPropertySchema>;
    required?: string[];
  };
}

export interface MCPPropertySchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: MCPPropertySchema;
  default?: unknown;
}

export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Tool categories
export type ToolCategory =
  | 'notes'
  | 'search'
  | 'folders'
  | 'tags'
  | 'analysis'
  | 'reminders'
  | 'utility'
  | 'web';

// MCP Error codes
export const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom errors
  NOTE_NOT_FOUND: -32001,
  FOLDER_NOT_FOUND: -32002,
  TAG_NOT_FOUND: -32003,
  INVALID_PATH: -32004,
  FILE_EXISTS: -32005,
  OPERATION_FAILED: -32006,
} as const;
