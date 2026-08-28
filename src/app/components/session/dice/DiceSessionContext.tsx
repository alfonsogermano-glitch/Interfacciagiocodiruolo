import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../auth/AuthContext';
import { useCampaign } from '../../../campaigns/CampaignContext';
import { useCampaignChannel, useRealtimeChannel } from '../../../../services/realtime/campaignChannel';
import { isRollResultPayload, sendSecretRollToGm } from '../../../../services/realtime/diceRealtime';
import { HollowgateDice3DRenderer } from './dice3dRenderer.ts';
import { projectRollTo3D } from './dice3dProjection.ts';
import { isDice3DAbortError } from './dice3dTypes.ts';
import { rollDiceFormula } from './diceEngine.ts';
import type { DiceRollRequest, RollResult } from './diceTypes.ts';

const DICE_3D_ENABLED_KEY = 'hollowgate.dice.3d-enabled';
const DICE_SETTLED_HOLD_MS = 1000;

type RevealState = 'pending' | 'animating' | 'revealed';

interface SessionRollEntry {
  result: RollResult;
  revealState: RevealState;
  receivedAt: number;
}

interface DiceSessionValue {
  rolls: RollResult[];
  submitLocalRoll: (request: DiceRollRequest) => RollResult;
  reroll: (resultId: string) => RollResult | null;
  clearLocalHistory: () => void;
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
  animationsEnabled: boolean;
  setAnimationsEnabled: (enabled: boolean) => void;
  setAnimationContainer: (container: HTMLElement | null) => void;
}

const DiceSessionContext = createContext<DiceSessionValue | null>(null);

function readAnimationsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(DICE_3D_ENABLED_KEY) !== 'false';
  } catch {
    return true;
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timeout = window.setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return isDice3DAbortError(error) ||
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError');
}

export function DiceSessionProvider({ children }: { children: React.ReactNode }) {
  const { user, session } = useAuth();
  const { activeCampaign } = useCampaign();
  const [entries, setEntries] = useState<SessionRollEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [animationsEnabledState, setAnimationsEnabledState] = useState(readAnimationsEnabled);
  const animationsEnabledRef = useRef(animationsEnabledState);
  const seenRollIds = useRef(new Set<string>());
  const animationContainerRef = useRef<HTMLElement | null>(null);
  const rendererRef = useRef<HollowgateDice3DRenderer | null>(null);
  const activeAnimationRollIdRef = useRef<string | null>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const isGm = activeCampaign?.ownerId === user?.id;

  const revealRoll = useCallback((resultId: string) => {
    setEntries((current) => current.map((entry) =>
      entry.result.id === resultId && entry.revealState !== 'revealed'
        ? { ...entry, revealState: 'revealed' }
        : entry,
    ));
    setHistoryOpen(true);
  }, []);

  const stopActiveAnimation = useCallback((revealInterrupted: boolean) => {
    const activeId = activeAnimationRollIdRef.current;
    if (revealInterrupted && activeId) revealRoll(activeId);
    activeAbortControllerRef.current?.abort();
    activeAbortControllerRef.current = null;
    activeAnimationRollIdRef.current = null;
    rendererRef.current?.dispose();
    rendererRef.current = null;
  }, [revealRoll]);

  const playAnimation = useCallback((result: RollResult) => {
    const container = animationContainerRef.current;
    if (!animationsEnabledRef.current || !container || projectRollTo3D(result).length === 0) {
      revealRoll(result.id);
      return;
    }

    // No queue: the newest roll always replaces the current folklore animation.
    stopActiveAnimation(true);

    const controller = new AbortController();
    const renderer = new HollowgateDice3DRenderer();
    activeAnimationRollIdRef.current = result.id;
    activeAbortControllerRef.current = controller;
    rendererRef.current = renderer;
    setEntries((current) => current.map((entry) =>
      entry.result.id === result.id ? { ...entry, revealState: 'animating' } : entry,
    ));

    void (async () => {
      try {
        await renderer.init(container);
        if (controller.signal.aborted) {
          renderer.dispose();
          return;
        }
        await renderer.play(result, controller.signal);
        await delay(DICE_SETTLED_HOLD_MS, controller.signal);
        if (controller.signal.aborted || activeAnimationRollIdRef.current !== result.id) return;
        revealRoll(result.id);
        renderer.clear();
      } catch (error) {
        if (isAbortError(error)) {
          renderer.dispose();
        } else if (activeAnimationRollIdRef.current === result.id) {
          console.error('Animazione dadi 3D non disponibile:', error);
          revealRoll(result.id);
          renderer.clear();
        }
      } finally {
        if (activeAnimationRollIdRef.current === result.id) {
          activeAnimationRollIdRef.current = null;
          activeAbortControllerRef.current = null;
        }
      }
    })();
  }, [revealRoll, stopActiveAnimation]);

  const ingestRoll = useCallback((result: RollResult): boolean => {
    if (seenRollIds.current.has(result.id)) return false;
    seenRollIds.current.add(result.id);
    setEntries((current) => [
      ...current,
      { result, revealState: 'pending', receivedAt: Date.now() },
    ]);
    playAnimation(result);
    return true;
  }, [playAnimation]);

  const setAnimationContainer = useCallback((container: HTMLElement | null) => {
    animationContainerRef.current = container;
    if (!container) stopActiveAnimation(true);
  }, [stopActiveAnimation]);

  const setAnimationsEnabled = useCallback((enabled: boolean) => {
    animationsEnabledRef.current = enabled;
    setAnimationsEnabledState(enabled);
    try {
      window.localStorage.setItem(DICE_3D_ENABLED_KEY, String(enabled));
    } catch {
      // Preference persistence is optional; rolling must keep working.
    }
    if (!enabled) stopActiveAnimation(true);
  }, [stopActiveAnimation]);

  useEffect(() => {
    animationsEnabledRef.current = animationsEnabledState;
  }, [animationsEnabledState]);

  useEffect(() => {
    stopActiveAnimation(false);
    seenRollIds.current.clear();
    setEntries([]);
    setHistoryOpen(false);
  }, [activeCampaign?.id, stopActiveAnimation]);

  useEffect(() => () => stopActiveAnimation(false), [stopActiveAnimation]);

  const publicChannel = useCampaignChannel(activeCampaign?.id, {
    onBroadcast: {
      dice_roll: (message) => {
        const payload = message?.payload;
        if (!activeCampaign || !isRollResultPayload(payload)) return;
        if (payload.campaignId !== activeCampaign.id) return;
        if (payload.visibility !== 'public') return;
        ingestRoll(payload);
      },
    },
  });

  useRealtimeChannel(isGm && user ? `profile:${user.id}` : null, {
    onBroadcast: {
      dice_roll: (message) => {
        const payload = message?.payload;
        if (!activeCampaign || !isRollResultPayload(payload)) return;
        if (payload.campaignId !== activeCampaign.id) return;
        if (payload.visibility !== 'secret') return;
        if (payload.rollerId === activeCampaign.ownerId) return;
        ingestRoll(payload);
      },
    },
  });

  const buildResult = useCallback((request: DiceRollRequest): RollResult => {
    if (!user || !activeCampaign) {
      throw new Error('Per tirare i dadi devi essere dentro una campagna con un utente autenticato.');
    }

    return rollDiceFormula({
      identity: {
        campaignId: activeCampaign.id,
        rollerId: user.id,
        rollerName: user.displayName,
        rollerAvatarUrl: user.avatarUrl,
      },
      request,
    });
  }, [activeCampaign, user]);

  const dispatchRoll = useCallback((result: RollResult) => {
    if (!activeCampaign || !user) return;

    if (result.visibility === 'public') {
      void publicChannel.send(
        'dice_roll',
        result as unknown as Record<string, unknown>,
      ).catch((error) => {
        console.error('Errore broadcast tiro pubblico:', error);
        toast.error('Tiro registrato localmente, ma non inviato agli altri giocatori.');
      });
      return;
    }

    if (result.visibility === 'secret') {
      if (activeCampaign.ownerId === user.id) return;
      const accessToken = session?.access_token;
      if (!accessToken) {
        toast.error('Tiro segreto registrato localmente, ma non inviato al Game Master.');
        return;
      }
      void sendSecretRollToGm(activeCampaign.id, result, accessToken).catch((error) => {
        console.error('Errore invio tiro segreto al GM:', error);
        toast.error('Tiro segreto registrato localmente, ma non inviato al Game Master.');
      });
    }
  }, [activeCampaign, publicChannel.send, session?.access_token, user]);

  const submitLocalRoll = useCallback((request: DiceRollRequest): RollResult => {
    const result = buildResult(request);
    ingestRoll(result);
    dispatchRoll(result);
    return result;
  }, [buildResult, dispatchRoll, ingestRoll]);

  const rolls = useMemo(
    () => entries.filter((entry) => entry.revealState === 'revealed').map((entry) => entry.result),
    [entries],
  );

  const reroll = useCallback((resultId: string): RollResult | null => {
    const previous = rolls.find((roll) => roll.id === resultId);
    if (!previous) return null;

    return submitLocalRoll({
      items: previous.sourceItems.map((item) => ({ ...item })) as DiceRollRequest['items'],
      formulaId: previous.formulaId,
      formulaName: previous.formulaName,
      visibility: previous.visibility,
    });
  }, [rolls, submitLocalRoll]);

  const clearLocalHistory = useCallback(() => {
    stopActiveAnimation(false);
    setEntries([]);
  }, [stopActiveAnimation]);

  const value = useMemo<DiceSessionValue>(() => ({
    rolls,
    submitLocalRoll,
    reroll,
    clearLocalHistory,
    historyOpen,
    setHistoryOpen,
    animationsEnabled: animationsEnabledState,
    setAnimationsEnabled,
    setAnimationContainer,
  }), [
    rolls,
    submitLocalRoll,
    reroll,
    clearLocalHistory,
    historyOpen,
    animationsEnabledState,
    setAnimationsEnabled,
    setAnimationContainer,
  ]);

  return (
    <DiceSessionContext.Provider value={value}>
      {children}
    </DiceSessionContext.Provider>
  );
}

export function useDiceSession(): DiceSessionValue {
  const context = useContext(DiceSessionContext);
  if (!context) throw new Error('useDiceSession deve essere usato dentro DiceSessionProvider.');
  return context;
}
