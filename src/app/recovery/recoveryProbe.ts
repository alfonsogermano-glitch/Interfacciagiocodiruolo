/** A short, unauthenticated health check before importing the legacy Supabase React graph.
 * It does not validate account credentials, campaign access or the egress quota itself.
 * The REST probe also detects broad quota errors which can coexist with healthy Auth.
 */
export type RecoveryStatus = 'available' | 'unavailable';
export async function probeLegacyBackend(
  serviceUrl: string,
  anonKey: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 3500,
): Promise<RecoveryStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const base = new URL(serviceUrl);
    if (base.protocol !== 'https:' || !anonKey) return 'unavailable';
    const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
    const [auth, rest] = await Promise.all([
      fetcher(new URL('/auth/v1/health', base), { headers, signal: controller.signal, cache: 'no-store' }),
      fetcher(new URL('/rest/v1/profiles?select=id&limit=0', base), { headers, signal: controller.signal, cache: 'no-store' }),
    ]);
    return auth.ok && rest.ok ? 'available' : 'unavailable';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timeout);
  }
}
