import { useCallback } from 'react';
import { useAppStore } from '../stores/app-store';
import type { NoteMetadata, Tag } from '../../shared/types';

export function useNotes() {
  const { setNotes, setFolders, setTags, setCurrentNote, setCurrentNoteContent, openNoteWithContent, notes } = useAppStore();

  const loadNotes = useCallback(async (folder?: string) => {
    try {
      const notesList = await window.electron.notes.list(folder);
      setNotes(notesList);
    } catch (error) {
      console.error('Error loading notes:', error);
    }
  }, [setNotes]);

  const loadFolders = useCallback(async () => {
    try {
      const foldersList = await window.electron.folders.list();
      // Backend returns string[] directly (folder paths)
      setFolders(foldersList);
    } catch (error) {
      console.error('Error loading folders:', error);
    }
  }, [setFolders]);

  const loadTags = useCallback(async () => {
    try {
      const tagsList = await window.electron.tags.list();
      setTags(tagsList);
    } catch (error) {
      console.error('Error loading tags:', error);
    }
  }, [setTags]);

  const openNote = useCallback(async (note: NoteMetadata) => {
    console.log('🔓 Opening note by id:', note.id, note.name, note);
    // Clear current content immediately to avoid showing stale content while loading
    openNoteWithContent(note, '');
    try {
      const fullNote = await window.electron.notes.readById(note.id);
      console.log('🔓 Full note received:', fullNote);
      console.log('🔓 Content type:', typeof fullNote?.content, 'Length:', fullNote?.content?.length);
      console.log('🔓 Content preview:', fullNote?.content?.slice(0, 200));
      if (fullNote) {
        console.log('🔓 Setting current note and content ATOMICALLY, content length:', fullNote.content?.length);
        // Use atomic operation to prevent race conditions
        openNoteWithContent(fullNote, fullNote.content || '');
      } else {
        console.log('❌ No full note returned');
      }
    } catch (error) {
      console.error('Error opening note:', error);
    }
  }, [openNoteWithContent]);

  const createNote = useCallback(async (name: string, content?: string, folder?: string) => {
    try {
      const newNote = await window.electron.notes.create(name, content, folder);
      await loadNotes();
      await openNote(newNote);
      return newNote;
    } catch (error) {
      console.error('Error creating note:', error);
      throw error;
    }
  }, [loadNotes, openNote]);

  const updateNote = useCallback(async (name: string, content: string) => {
    try {
      await window.electron.notes.update(name, content);
    } catch (error) {
      console.error('Error updating note:', error);
      throw error;
    }
  }, []);

  const updateNoteById = useCallback(async (id: number, content: string) => {
    try {
      return await window.electron.notes.updateById(id, content);
    } catch (error) {
      console.error('Error updating note by id:', error);
      throw error;
    }
  }, []);

  const deleteNote = useCallback(async (name: string) => {
    try {
      await window.electron.notes.delete(name);
      await loadNotes();
    } catch (error) {
      console.error('Error deleting note:', error);
      throw error;
    }
  }, [loadNotes]);

  const renameNote = useCallback(async (oldName: string, newName: string) => {
    try {
      await window.electron.notes.rename(oldName, newName);
      await loadNotes();
    } catch (error) {
      console.error('Error renaming note:', error);
      throw error;
    }
  }, [loadNotes]);

  const moveNote = useCallback(async (name: string, folder: string) => {
    try {
      await window.electron.notes.move(name, folder);
      await loadNotes();
    } catch (error) {
      console.error('Error moving note:', error);
      throw error;
    }
  }, [loadNotes]);

  const searchNotes = useCallback(async (query: string) => {
    try {
      return await window.electron.notes.search(query);
    } catch (error) {
      console.error('Error searching notes:', error);
      return [];
    }
  }, []);

  return {
    notes,
    loadNotes,
    loadFolders,
    loadTags,
    openNote,
    createNote,
    updateNote,
    updateNoteById,
    deleteNote,
    renameNote,
    moveNote,
    searchNotes,
  };
}
