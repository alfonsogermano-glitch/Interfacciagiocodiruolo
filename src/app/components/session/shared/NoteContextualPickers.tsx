import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { usePortalContainer } from '../../ui/portal-container';
import { FONT_SIZES } from './tiptapFontSize';
import { FONT_FAMILIES } from './tiptapFontFamily';
import { NoteIconGrid } from './NoteIconGrid';
import { useAuth } from '../../../auth/AuthContext';
import { supabase, isSupabaseConfigured } from '../../../../lib/supabaseClient';
import './noteContextualMenus.css';

const MAX_IMAGE_MB = 5;

interface PickerBaseProps {
  trigger: ReactElement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function PickerTooltip({ trigger, label }: { trigger: ReactNode; label: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const portalContainer = usePortalContainer();

  return (
    <>
      <span
        className="inline-flex"
        onPointerEnter={(event) => setRect(event.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setRect(null)}
        onPointerDown={() => setRect(null)}
      >
        {trigger}
      </span>
      {rect && createPortal(
        <div
          data-note-picker-tooltip="true"
          role="tooltip"
          className="pointer-events-none fixed z-[10000] rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2.5 py-1.5 text-xs text-[var(--dash-text)] shadow-lg"
          style={{ top: Math.max(8, rect.top - 38), left: Math.max(8, rect.left + rect.width / 2), transform: 'translateX(-50%)' }}
        >
          {label}
          <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-[var(--dash-border-soft)] bg-[var(--dash-panel)]" />
        </div>,
        portalContainer ?? document.body,
      )}
    </>
  );
}

export function NoteFontSizePicker({ trigger, open, onOpenChange, onChoose }: PickerBaseProps & { onChoose: (size: number) => void }) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PickerTooltip trigger={<PopoverTrigger asChild>{trigger}</PopoverTrigger>} label="Dimensione testo" />
      <PopoverContent data-note-contextual-picker="true" side="top" align="start" collisionPadding={8} className="w-40 z-[9999] border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1 text-[var(--dash-text)]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="grid grid-cols-3 gap-1">
          {FONT_SIZES.map((size) => (
            <button key={size} type="button" onClick={() => { onChoose(size); onOpenChange(false); }} className="rounded-md px-2 py-1.5 text-sm hover:bg-[var(--dash-surface-2)]">{size}</button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function NoteFontFamilyPicker({ trigger, open, onOpenChange, onChoose }: PickerBaseProps & { onChoose: (label: string) => void }) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PickerTooltip trigger={<PopoverTrigger asChild>{trigger}</PopoverTrigger>} label="Font" />
      <PopoverContent data-note-contextual-picker="true" side="top" align="start" collisionPadding={8} className="tiptap-font-popover w-52 z-[9999] border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1 text-[var(--dash-text)]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="tiptap-font-popover-scroll flex max-h-72 flex-col gap-0.5 overflow-y-scroll pr-1">
          {FONT_FAMILIES.map(({ label, value }) => (
            <button key={label} type="button" onClick={() => { onChoose(label); onOpenChange(false); }} className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--dash-surface-2)]" style={{ fontFamily: value }}>{label}</button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function NoteInlineIconPicker({ trigger, open, onOpenChange, onChoose }: PickerBaseProps & { onChoose: (name: string) => void }) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PickerTooltip trigger={<PopoverTrigger asChild>{trigger}</PopoverTrigger>} label="Icone" />
      <PopoverContent data-note-contextual-picker="true" side="top" align="start" collisionPadding={8} className="tiptap-icon-popover w-64 z-[9999] border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-2 text-[var(--dash-text)]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <NoteIconGrid onChoose={(name) => { onChoose(name); onOpenChange(false); }} />
      </PopoverContent>
    </Popover>
  );
}

export function NoteImagePicker({ trigger, open, onOpenChange, onChoose }: PickerBaseProps & { onChoose: (src: string) => void }) {
  const [urlDraft, setUrlDraft] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const chooseUrl = () => {
    const src = urlDraft.trim();
    if (!src) return;
    onChoose(src);
    setUrlDraft('');
    onOpenChange(false);
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.alert('Seleziona un file immagine.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      window.alert(`L'immagine non può superare i ${MAX_IMAGE_MB} MB.`);
      event.target.value = '';
      return;
    }
    if (!isSupabaseConfigured || !supabase || !user) {
      window.alert('Caricamento immagine non disponibile: utente non autenticato.');
      event.target.value = '';
      return;
    }
    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('note-images').upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('note-images').getPublicUrl(path);
      onChoose(publicUrl);
      onOpenChange(false);
    } catch (error) {
      console.log('Errore upload immagine nota:', error);
      window.alert('Caricamento immagine non riuscito. Riprova.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PickerTooltip trigger={<PopoverTrigger asChild>{trigger}</PopoverTrigger>} label="Immagine" />
      <PopoverContent data-note-contextual-picker="true" side="top" align="start" collisionPadding={8} className="tiptap-image-popover w-64 z-[9999] border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-text)]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <Tabs defaultValue="url" className="gap-3">
          <TabsList className="w-full border border-[var(--dash-border-soft)] bg-[var(--dash-surface)]">
            <TabsTrigger value="url">Da URL</TabsTrigger><TabsTrigger value="file">Da file</TabsTrigger>
          </TabsList>
          <TabsContent value="url" className="flex min-h-[76px] flex-col gap-2">
            <Input type="url" placeholder="https://…" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); chooseUrl(); } }} />
            <Button type="button" size="sm" disabled={!urlDraft.trim()} onClick={chooseUrl}>Inserisci</Button>
          </TabsContent>
          <TabsContent value="file" className="flex min-h-[76px] flex-col gap-2">
            <p className="text-xs text-[var(--dash-muted)]">Carica un'immagine dal tuo dispositivo.</p>
            <Button type="button" size="sm" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>{isUploading ? 'Caricamento…' : 'Scegli file'}</Button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelected} className="hidden" />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
