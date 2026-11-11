// Staging VTT lobby protocol. No Supabase sessions, bearer tokens,
// campaign calls, or locally cached authorization state are accepted.
export function validateBootstrap(data) {
  if (!data || data.backend !== 'aruba-staging' || !data.user ||
      typeof data.user.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.user.id) ||
      typeof data.user.email !== 'string' ||
      typeof data.user.displayName !== 'string' ||
      !['standard','admin'].includes(data.user.role)) {
    throw new Error('Identità Aruba non valida');
  }
  const c=data.capabilities;
  if (!c || c.campaigns?.read !== false || c.campaigns?.write !== false ||
      c.characters?.read !== false || c.characters?.write !== false ||
      c.gameSession !== false) {
    throw new Error('Funzionalità non ancora autorizzate');
  }
  return Object.freeze({
    id:data.user.id,email:data.user.email,
    displayName:data.user.displayName,role:data.user.role,
  });
}

export async function loadPilotSession(fetchImpl) {
  const response=await fetchImpl('/vtt/bootstrap',{
    method:'GET',credentials:'same-origin',cache:'no-store',
    redirect:'error',headers:{Accept:'application/json'},
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Servizio Aruba non disponibile');
  return validateBootstrap(await response.json());
}

export async function logoutPilot(fetchImpl) {
  const response=await fetchImpl('/auth/logout',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    redirect:'error',
  });
  if (!response.ok) throw new Error('Impossibile terminare la sessione');
}
