import { supabase } from '../../lib/supabaseClient';
import type { UserRole } from '../../app/auth/AuthContext';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  registeredAt: string;
}

export async function loadAdminUsers(): Promise<AdminUser[]> {
  if (!supabase) throw new Error('Supabase non disponibile');
  const users: AdminUser[] = [];
  const pageSize = 200;
  // Evita il limite predefinito di righe dell'API: anche gli utenti oltre
  // la prima pagina devono comparire nella gestione.
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.rpc('admin_list_users').range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    users.push(...rows.map((row: any): AdminUser => ({
      id: row.user_id,
      email: row.email ?? '',
      displayName: row.display_name ?? 'Utente',
      role: row.role === 'admin' ? 'admin' : 'standard',
      registeredAt: row.registered_at,
    })));
    if (rows.length < pageSize) return users;
  }
}

export async function setAdminUserRole(id: string, role: UserRole): Promise<void> {
  if (!supabase) throw new Error('Supabase non disponibile');
  const { error } = await supabase.rpc('admin_set_user_role', { target_user_id: id, new_role: role });
  if (error) throw new Error(error.message);
}
