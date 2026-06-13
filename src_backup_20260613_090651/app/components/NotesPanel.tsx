import { ScrollText, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { generateUUID } from '../../lib/uuid';

interface Note {
  id: string;
  title: string;
  content: string;
  timestamp: number;
}

export function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const addNote = () => {
    if (!newTitle.trim() || !newContent.trim()) return;

    if (editingId) {
      setNotes(prev => prev.map(note =>
        note.id === editingId
          ? { ...note, title: newTitle, content: newContent, timestamp: Date.now() }
          : note
      ));
      setEditingId(null);
    } else {
      setNotes(prev => [{
        id: generateUUID(),
        title: newTitle,
        content: newContent,
        timestamp: Date.now()
      }, ...prev]);
    }

    setNewTitle('');
    setNewContent('');
  };

  const editNote = (note: Note) => {
    setNewTitle(note.title);
    setNewContent(note.content);
    setEditingId(note.id);
  };

  const deleteNote = (id: string) => {
    setNotes(prev => prev.filter(note => note.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setNewTitle('');
      setNewContent('');
    }
  };

  return (
    <div className="bg-[#1a1a1a] border-2 border-[#4a0e0e] rounded-lg p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <ScrollText className="w-5 h-5 text-[#8b1e1e]" />
        <h2 className="text-[#e8d4b8]">Note del GM</h2>
      </div>

      <div className="mb-4 space-y-3">
        <input
          type="text"
          placeholder="Titolo nota..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="w-full bg-[#2a0a0a] border border-[#4a0e0e] rounded px-3 py-2 text-[#e8d4b8] placeholder-[#6b5544] focus:outline-none focus:border-[#6b1515]"
        />
        <textarea
          placeholder="Scrivi una nota..."
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          className="w-full bg-[#2a0a0a] border border-[#4a0e0e] rounded px-3 py-2 text-[#e8d4b8] placeholder-[#6b5544] focus:outline-none focus:border-[#6b1515] resize-none"
          rows={3}
        />
        <button
          onClick={addNote}
          className="w-full bg-[#4a0e0e] border border-[#6b1515] rounded px-4 py-2 text-[#e8d4b8] hover:bg-[#6b1515] transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {editingId ? 'Aggiorna Nota' : 'Aggiungi Nota'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {notes.length === 0 ? (
          <div className="text-center text-[#8b7355] py-8">
            <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Nessuna nota presente</p>
          </div>
        ) : (
          notes.map(note => (
            <div
              key={note.id}
              className="bg-[#2a0a0a] border border-[#4a0e0e] rounded p-3 hover:border-[#6b1515] transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <h4 className="text-[#e8d4b8]">{note.title}</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => editNote(note)}
                    className="text-[#8b7355] hover:text-[#e8d4b8] text-sm"
                  >
                    Modifica
                  </button>
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="text-[#8b1e1e] hover:text-[#b82e2e]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-[#8b7355] text-sm whitespace-pre-wrap">{note.content}</p>
              <p className="text-[#6b5544] text-xs mt-2">
                {new Date(note.timestamp).toLocaleString('it-IT')}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
