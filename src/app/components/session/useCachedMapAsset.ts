import { useEffect, useState } from 'react';

export type MapAssetLoadState = {
  sourceUrl: string | null;
  resolvedUrl: string | null;
  status: 'idle' | 'checking' | 'downloading' | 'decoding' | 'ready' | 'error';
  progress: number | null;
  etaMs: number | null;
  fromCache: boolean;
  error: string | null;
};

const CACHE_NAME = 'hollowgate-map-assets-v1';

export function useCachedMapAsset(sourceUrl: string | null): MapAssetLoadState {
  const [state, setState] = useState<MapAssetLoadState>({ sourceUrl: null, resolvedUrl: null, status: 'idle', progress: null, etaMs: null, fromCache: false, error: null });

  useEffect(() => {
    if (!sourceUrl) {
      setState({ sourceUrl: null, resolvedUrl: null, status: 'idle', progress: null, etaMs: null, fromCache: false, error: null });
      return;
    }
    const controller = new AbortController();
    const startedAt = performance.now();
    let objectUrl: string | null = null;
    let cancelled = false;
    setState({ sourceUrl, resolvedUrl: null, status: 'checking', progress: 0, etaMs: null, fromCache: false, error: null });

    const decode = async (url: string, fromCache: boolean) => {
      setState(current => current.sourceUrl === sourceUrl ? { ...current, resolvedUrl: url, status: 'decoding', progress: 100, etaMs: 500, fromCache } : current);
      const image = new Image();
      image.src = url;
      await image.decode();
      if (cancelled || image.naturalWidth <= 0) return;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!cancelled) setState({ sourceUrl, resolvedUrl: url, status: 'ready', progress: 100, etaMs: 0, fromCache, error: null });
    };

    void (async () => {
      try {
        const cache = 'caches' in window ? await caches.open(CACHE_NAME) : null;
        const cached = await cache?.match(sourceUrl);
        let blob: Blob;
        let fromCache = false;
        if (cached) {
          blob = await cached.blob();
          fromCache = true;
        } else {
          setState(current => current.sourceUrl === sourceUrl ? { ...current, status: 'downloading', progress: null } : current);
          const response = await fetch(sourceUrl, { signal: controller.signal, credentials: 'omit' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const total = Number(response.headers.get('content-length')) || 0;
          const reader = response.body?.getReader();
          if (!reader) blob = await response.blob();
          else {
            const chunks: Uint8Array[] = [];
            let loaded = 0;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
              loaded += value.byteLength;
              const elapsedSeconds = Math.max(0.1, (performance.now() - startedAt) / 1000);
              const bytesPerSecond = loaded / elapsedSeconds;
              const etaMs = total > loaded && bytesPerSecond > 0 ? (total - loaded) / bytesPerSecond * 1000 : total > 0 ? 0 : null;
              setState(current => current.sourceUrl === sourceUrl ? { ...current, progress: total > 0 ? Math.min(99, loaded / total * 100) : null, etaMs } : current);
            }
            blob = new Blob(chunks, { type: response.headers.get('content-type') ?? 'application/octet-stream' });
          }
          if (cache) await cache.put(sourceUrl, new Response(blob, { headers: { 'content-type': blob.type } })).catch(() => undefined);
        }
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        await decode(objectUrl, fromCache);
      } catch (error) {
        if (controller.signal.aborted || cancelled) return;
        // Cross-origin image hosts may allow <img> but reject fetch(). The direct
        // URL still benefits from the browser HTTP cache, albeit without bytes.
        try {
          await decode(sourceUrl, false);
        } catch {
          if (!cancelled) setState({ sourceUrl, resolvedUrl: null, status: 'error', progress: null, etaMs: null, fromCache: false, error: error instanceof Error ? error.message : 'Caricamento non riuscito' });
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sourceUrl]);

  return state.sourceUrl === sourceUrl ? state : { sourceUrl, resolvedUrl: null, status: sourceUrl ? 'checking' : 'idle', progress: 0, etaMs: null, fromCache: false, error: null };
}
