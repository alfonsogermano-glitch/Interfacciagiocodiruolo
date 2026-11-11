import { useMemo } from 'react';
import { ActiveSceneMap } from '../../app/components/session/ActiveSceneMap';
import { isActiveScenePublication } from '../../types/activeScene';
import { useGmHostSession } from './useGmHostSession';
import type { GmHostRole } from './gmHostReactBridge';

/**
 * Opt-in laboratory viewer, using the real Hollowgate scene renderer.
 * This component is deliberately not routed into the production VTT.
 * Fog/lighting overlays, editing and private GM controls still require
 * integration with SessionWorkspace's full rendering and permissions.
 */
export function GmHostScenePreview({ enabled, role, origin, token }: {
  enabled: boolean; role: GmHostRole; origin: string; token: string | null;
}) {
  const session = useGmHostSession({ enabled, role, origin, token });
  const scene = isActiveScenePublication(session.activeScene) ? session.activeScene : null;
  const tokenCount = useMemo(() => scene?.mapTokens?.length ?? 0, [scene]);
  if (!enabled) return null;
  return (
    <section aria-label="Anteprima GM Host" className="flex flex-col gap-3">
      <p role="status">GM Host: {session.status} · sequenza {session.sequence}</p>
      {session.error ? <p role="alert">{session.error}</p> : null}
      {scene ? (
        <div className="flex flex-col gap-2">
          <h3>{scene.title}</h3>
          <p>{scene.chapterTitle} · {tokenCount} pedine visibili</p>
          <ActiveSceneMap scene={scene} />
        </div>
      ) : <p>Nessuna scena pubblicata dal Game Master.</p>}
    </section>
  );
}
