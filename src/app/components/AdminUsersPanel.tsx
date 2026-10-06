import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useAuth, USER_ROLE_LABELS, type UserRole } from '../auth/AuthContext';
import { loadAdminUsers, setAdminUserRole, type AdminUser } from '../../services/supabase/adminUsersService';

export function AdminUsersPanel() {
  const { user, isAdmin, refreshUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadAdminUsers().then((loaded) => {
      if (!cancelled) setUsers(loaded);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Errore caricamento utenti');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isAdmin, reload]);

  const changeRole = async (target: AdminUser, role: UserRole) => {
    if (!isAdmin || savingId || role === target.role) return;
    setSavingId(target.id);
    setError(null);
    setNotice(null);
    try {
      await setAdminUserRole(target.id, role);
      setUsers((current) => current.map((item) => item.id === target.id ? { ...item, role } : item));
      setNotice(`Tipologia di ${target.displayName} aggiornata: ${USER_ROLE_LABELS[role]}.`);
      if (target.id === user?.id) await refreshUser();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Errore aggiornamento tipologia');
    } finally {
      setSavingId(null);
    }
  };

  if (!isAdmin) return null;

  return (
    <section aria-label="Gestione Utenti" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium text-[var(--dash-text-strong)]">Utenti registrati {!loading && `(${users.length})`}</h4>
        <button type="button" onClick={() => setReload((value) => value + 1)} disabled={loading || !!savingId}
          className="inline-flex items-center gap-2 rounded-md border border-[var(--dash-border)] px-3 py-2 text-xs disabled:opacity-50">
          <RefreshCw className="h-3.5 w-3.5" /> Aggiorna
        </button>
      </div>
      {error && <p role="alert" className="rounded-md bg-[var(--dash-danger-bg)] p-3 text-sm text-[var(--dash-danger-text)]">{error}</p>}
      {notice && <p role="status" className="text-sm text-[var(--dash-muted)]">{notice}</p>}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Caricamento utenti…</div>
      ) : (
        <div className="space-y-2">
          {users.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] p-3">
              <div className="min-w-0 flex-1">
                <div className="break-words text-sm font-medium">{item.displayName}{item.id === user?.id && ' (tu)'}</div>
                <div className="break-all text-xs text-[var(--dash-muted)]">{item.email || 'Email non disponibile'}</div>
                <div className="mt-1 text-xs text-[var(--dash-muted)]">Registrato il {new Date(item.registeredAt).toLocaleDateString('it-IT')}</div>
              </div>
              <div className="flex items-center gap-2">
                {savingId === item.id && <Loader2 className="h-4 w-4 animate-spin" />}
                <select aria-label={`Tipologia utente ${item.email || item.displayName}`} value={item.role} disabled={!!savingId}
                  onChange={(event) => { void changeRole(item, event.target.value as UserRole); }}
                  className="rounded-md border border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-sm disabled:opacity-50">
                  {Object.entries(USER_ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
                </select>
              </div>
            </div>
          ))}
          {users.length === 0 && !error && <p className="text-sm text-[var(--dash-muted)]">Nessun utente registrato.</p>}
        </div>
      )}
    </section>
  );
}
