export const SESSION_NOTE_OPEN_EVENT = 'hollowgate:open-session-note';
export const SESSION_NOTE_PICK_EVENT = 'hollowgate:pick-session-note';
export const SESSION_NOTE_PICKED_EVENT = 'hollowgate:session-note-picked';

export interface SessionNoteOpenRequest {
  noteId: string;
  deliver?: boolean;
}

export interface SessionNotePickRequest {
  poiId: string;
  deliver?: boolean;
}

export interface SessionNotePicked {
  poiId: string;
  noteId: string;
  noteLabel: string;
  visibleToPlayers: boolean;
}

export function requestSessionNoteOpen(noteId: string) {
  window.dispatchEvent(new CustomEvent<SessionNoteOpenRequest>(SESSION_NOTE_OPEN_EVENT, { detail: { noteId } }));
}

export function requestSessionNotePick(poiId: string) {
  window.dispatchEvent(new CustomEvent<SessionNotePickRequest>(SESSION_NOTE_PICK_EVENT, { detail: { poiId } }));
}

export function completeSessionNotePick(detail: SessionNotePicked) {
  window.dispatchEvent(new CustomEvent<SessionNotePicked>(SESSION_NOTE_PICKED_EVENT, { detail }));
}
