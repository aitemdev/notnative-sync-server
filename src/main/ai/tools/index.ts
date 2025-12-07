import type { ToolContext } from '../context';
import { createNoteTools } from './notes';
import { createTagTools } from './tags';
import { createFolderTools } from './folders';
import { createSystemTools } from './system';

export function createAllTools(ctx: ToolContext) {
  return {
    ...createNoteTools(ctx),
    ...createTagTools(ctx),
    ...createFolderTools(ctx),
    ...createSystemTools(ctx),
  };
}

export { createNoteTools } from './notes';
export { createTagTools } from './tags';
export { createFolderTools } from './folders';
export { createSystemTools } from './system';
