import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../auth/AuthContext';
import { useCampaign } from '../../../campaigns/CampaignContext';
import { useCampaignChannel, useRealtimeChannel } from '../../../../services/realtime/campaignChannel';
import { isRollResultPayload, sendSecretRollToGm } from '../../../../services/realtime/diceRealtime';
import { DiceAppearanceProvider, useDiceAppearance } from './DiceAppearanceContext';
import { attachDiceAppearanceSnapshots } from './diceAppearance.ts';
import { HollowgateDice3DRenderer } from './dice3dRenderer.ts';
import { projectRollTo3D } from './dice3dProjection.ts';
import { isDice3DAbortError } from './dice3dTypes.ts';
import { cryptoDiceRng, rollDiceFormula } from './diceEngine.ts';
import { saveRollEntry } from '../../../../services/supabase/chatService';
import { getCustomDieQuickRollMax } from './diceCustomDie.ts';
import { ModifierFormulaError, evaluateModifierFormula, type ModifierReference } from '../shared/modifierFormula.ts';
import { parseModifierValue } from '../shared/tiptapInlineModifier.ts';
import type { CustomDieRollSnapshot, DiceRollRequest, RollDiceGroup, RollResult } from './diceTypes.ts';

export interface ModifierRollSubmit {
  name: string;
  expression: string;
  formula?: string;
  resolveName?: (name: string) => ModifierReference | null;
}

export interface InlineCustomDieRollSubmit {
  name: string;
  quantity: number;
  customDie: CustomDieRollSnapshot;
}

const DICE_3D_ENABLED_KEY = 'hollowgate.dice.3d-enabled';
const DICE_SETTLED_HOLD_MS = 1000;
const DICE_ANIMATED_SETTLED_HOLD_MS = 2000;

type RevealState = 'pending' | 'animating' | 'revealed';

interface SessionRollEntry {
  result: RollResult;
  revealState: RevealState;
  receivedAt: number;
}

interface DiceSessionValue {
  rolls: RollResult[];
  submitLocalRoll: (request: DiceRollRequest) => RollResult;
  /** Tiro da elemento Modificatore: nome in chat, niente Ritira. */
  submitModifierRoll: (input: ModifierRollSubmit) => RollResult | null;
  /** Tiro Custom da elemento Dado nelle Note: usa lo snapshot salvato, niente Ritira. */
  submitInlineCustomDieRoll: (input: InlineCustomDieRollSubmit) => RollResult | null;
  reroll: (resultId: string) => RollResult | null;
  /** Ritira un tiro noto anche solo dal suo RollResult (es. ricaricato dalla chat). */
  rerollResult: (previous: RollResult) => RollResult | null;
  clearLocalHistory: () => void;
  historyOpen: boolean;
  historyUnread: boolean;
  setHistoryOpen: (open: boolean) => void;
  openHistory: () => void;
  closeHistory: () => void;
  markHistoryRead: () => void;
  animationsEnabled: boolean;
  setAnimationsEnabled: (enabled: boolean) => void;
  setAnimationContainer: (container: HTMLElement | null) => void;
}

const DiceSessionContext = createContext<DiceSessionValue | null>(null);

function readAnimationsEnabled() {
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

function isAbortError(error: unknown) {
  return isDice3DAbortError(error)
    || (error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && error.name === 'AbortError');
}

interface DiceSessionProviderProps {
  children: React.ReactNode;
  /**
   * Segnala che un tiro pubblico ha FINITO di rotolare ed e' entrato nella
   * timeline della chat, con il created_at del server (null se non
   * disponibile). Usato dalla barra destra per accendere il pallino
   * sull'icona Chat quando il pannello e' chiuso (anche per i propri tiri,
   * come la cronica tiri), o per marcare il tiro come visto quando e' aperto.
   */
  onRollIngested?: (serverCreatedAt: string | null) => void;
}

function DiceSessionProviderBody({ children, onRollIngested }: DiceSessionProviderProps) {
  const { user, session } = useAuth();
  const { activeCampaign } = useCampaign();
  const { styles: standardStyles } = useDiceAppearance();
  const [entries, setEntries] = useState<SessionRollEntry[]>([]);
  const [historyOpen, setHistoryOpenState] = useState(false);
  const [historyUnread, setHistoryUnread] = useState(false);
  const historyOpenRef = useRef(false);
  const [animationsEnabledState, setAnimationsEnabledState] = useState(readAnimationsEnabled);
  const animationsEnabledRef = useRef(animationsEnabledState);
  const seenRollIds = useRef(new Set<string>());
  const animationContainerRef = useRef<HTMLElement | null>(null);
  const rendererRef = useRef<HollowgateDice3DRenderer | null>(null);
  const activeAnimationRollIdRef = useRef<string | null>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const isGm = activeCampaign?.ownerId === user?.id;

  // Ref per sempre-ultima-callback: ingestRoll resta stabile e non ha bisogno
  // di dipendere dallo stato corrente del pannello chat nella sidebar.
  const onRollIngestedRef = useRef(onRollIngested);
  onRollIngestedRef.current = onRollIngested;

  // Tiri pubblici in attesa di fine rotolamento: entrano nella timeline della
  // chat (e accendono il pallino) solo quando il dado ha finito di rotolare,
  // esattamente come la cronica tiri. La coda viene svuotata a reveal, a
  // cambio campagna e a Pulisci chat.
  const pendingChatRolls = useRef(new Map<string, RollResult>());

  const setHistoryOpen = useCallback((open: boolean) => {
    historyOpenRef.current = open;
    setHistoryOpenState(open);
    if (open) setHistoryUnread(false);
  }, []);
  const openHistory = useCallback(() => setHistoryOpen(true), [setHistoryOpen]);
  const closeHistory = useCallback(() => setHistoryOpen(false), [setHistoryOpen]);
  const markHistoryRead = useCallback(() => setHistoryUnread(false), []);

  const revealRoll = useCallback((resultId: string) => {
    setEntries((current) => current.map((entry) => (
      entry.result.id === resultId && entry.revealState !== 'revealed'
        ? { ...entry, revealState: 'revealed' }
        : entry
    )));
    if (!historyOpenRef.current) setHistoryUnread(true);
    // Chat: il tiro finito di rotolare entra nella timeline (persistenza nel
    // DB, card nella chat aperta via merge dei tiri rivelati, pallino se la
    // chat e' chiusa / timestamp "visto" se e' aperta). Prima della fine del
    // rotolamento la riga non esiste nel DB: aprirlo a meta' tiro non fa
    // comparire il risultato in anticipo.
    const pending = pendingChatRolls.current.get(resultId);
    if (pending) {
      pendingChatRolls.current.delete(resultId);
      void saveRollEntry(pending).then((serverCreatedAt) => {
        onRollIngestedRef.current?.(serverCreatedAt);
      });
    }
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
    const chunks = projectRollTo3D(result);
    if (!animationsEnabledRef.current || !container || chunks.length === 0) {
      revealRoll(result.id);
      return;
    }
    const settledHoldMs = chunks.some((chunk) => chunk.appearances?.some((descriptor) => descriptor?.appearance.effectsEnabled))
      ? DICE_ANIMATED_SETTLED_HOLD_MS
      : DICE_SETTLED_HOLD_MS;

    stopActiveAnimation(true);
    const controller = new AbortController();
    const renderer = new HollowgateDice3DRenderer();
    activeAnimationRollIdRef.current = result.id;
    activeAbortControllerRef.current = controller;
    rendererRef.current = renderer;
    setEntries((current) => current.map((entry) => (
      entry.result.id === result.id ? { ...entry, revealState: 'animating' } : entry
    )));

    void (async () => {
      try {
        await renderer.init(container);
        if (controller.signal.aborted) {
          renderer.dispose();
          return;
        }
        await renderer.play(result, controller.signal);
        await delay(settledHoldMs, controller.signal);
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

  const ingestRoll = useCallback((result: RollResult) => {
    if (seenRollIds.current.has(result.id)) return false;
    seenRollIds.current.add(result.id);
    setEntries((current) => [...current, { result, revealState: 'pending', receivedAt: Date.now() }]);
    // Tiro pubblico: accoda per la persistenza in chat a fine rotolamento
    // (idempotente: se anche gli altri client provano l'insert, il conflitto
    // sull'id viene ignorato). Deve avvenire PRIMA di playAnimation, che con
    // animazioni disattivate rivela (e quindi svuota la coda) sincronamente.
    // Il pallino segue lo stesso momento.
    if (result.visibility === 'public') {
      pendingChatRolls.current.set(result.id, result);
    }
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
      // Local preference is optional.
    }
    if (!enabled) stopActiveAnimation(true);
  }, [stopActiveAnimation]);

  useEffect(() => {
    animationsEnabledRef.current = animationsEnabledState;
  }, [animationsEnabledState]);

  useEffect(() => {
    stopActiveAnimation(false);
    seenRollIds.current.clear();
    pendingChatRolls.current.clear();
    setEntries([]);
    setHistoryUnread(false);
    setHistoryOpen(false);
  }, [activeCampaign?.id, setHistoryOpen, stopActiveAnimation]);

  useEffect(() => () => stopActiveAnimation(false), [stopActiveAnimation]);

  const publicChannel = useCampaignChannel(activeCampaign?.id, {
    onBroadcast: {
      dice_roll: (message) => {
        const payload = message?.payload;
        if (!activeCampaign || !isRollResultPayload(payload) || payload.campaignId !== activeCampaign.id || payload.visibility !== 'public') return;
        ingestRoll(payload);
      },
    },
  });

  useRealtimeChannel(isGm && user ? `profile:${user.id}` : null, {
    onBroadcast: {
      dice_roll: (message) => {
        const payload = message?.payload;
        if (
          !activeCampaign
          || !isRollResultPayload(payload)
          || payload.campaignId !== activeCampaign.id
          || payload.visibility !== 'secret'
          || payload.rollerId === activeCampaign.ownerId
        ) return;
        ingestRoll(payload);
      },
    },
  });

  const buildResult = useCallback((request: DiceRollRequest) => {
    if (!user || !activeCampaign) {
      throw new Error('Per tirare i dadi devi essere dentro una campagna con un utente autenticato.');
    }
    const canonical = rollDiceFormula({
      identity: {
        campaignId: activeCampaign.id,
        rollerId: user.id,
        rollerName: user.displayName,
        rollerAvatarUrl: user.avatarUrl,
      },
      request,
    });
    const withFormulaIcon = { ...canonical, formulaIconName: request.formulaIconName };
    return attachDiceAppearanceSnapshots(withFormulaIcon, standardStyles);
  }, [activeCampaign, standardStyles, user]);

  const dispatchRoll = useCallback((result: RollResult) => {
    if (!activeCampaign || !user) return;
    if (result.visibility === 'public') {
      void publicChannel.send('dice_roll', result as unknown as Record<string, unknown>).catch((error) => {
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

  const submitLocalRoll = useCallback((request: DiceRollRequest) => {
    const result = buildResult(request);
    ingestRoll(result);
    dispatchRoll(result);
    return result;
  }, [buildResult, dispatchRoll, ingestRoll]);

  const submitModifierRoll = useCallback((input: ModifierRollSubmit) => {
    if (!user || !activeCampaign) return null;
    const formula = input.formula?.trim() ?? '';
    // La Formula, se valida, rende inefficace il Valore numerico: si tira
    // solo la Formula. Altrimenti vale il Valore.
    if (formula) {
      let evaluated = null;
      try {
        evaluated = evaluateModifierFormula(formula, undefined, input.resolveName);
      } catch (error) {
        // Riferimento mancante o circolare: niente tiro silenzioso sul valore,
        // il widget rosso segnala gia' l'anomalia.
        if (error instanceof ModifierFormulaError && (error.code === 'missing' || error.code === 'cycle')) {
          toast.error(error.message);
          return null;
        }
        evaluated = null;
      }
      if (evaluated) {
        // Senza dadi non e' un tiro: niente voce in chat tiri.
        if (evaluated.diceCount === 0) return null;
        const formulaRollId = globalThis.crypto.randomUUID();
        const diceGroups: RollDiceGroup[] = evaluated.groups.map((group, groupIndex) => ({
          itemId: `formula-g${groupIndex + 1}`,
          sides: group.sides,
          requestedQuantity: group.faces.length,
          rolls: group.faces.map((face, dieIndex) => ({
            id: `${formulaRollId}:g${groupIndex + 1}r${dieIndex + 1}`,
            groupItemId: `formula-g${groupIndex + 1}`,
            sides: group.sides,
            face,
            contribution: face,
            active: true,
            source: 'base' as const,
            explosionDepth: 0,
            chainId: `${formulaRollId}:chain${groupIndex + 1}`,
          })),
          activeRollIds: group.faces.map((_, dieIndex) => `${formulaRollId}:g${groupIndex + 1}r${dieIndex + 1}`),
          contribution: group.faces.reduce((sum, face) => sum + face, 0),
        }));
        const formulaResult: RollResult = attachDiceAppearanceSnapshots({
          id: formulaRollId,
          campaignId: activeCampaign.id,
          rollerId: user.id,
          rollerName: user.displayName,
          rollerAvatarUrl: user.avatarUrl,
          formulaName: input.name,
          formulaText: formula,
          visibility: 'public',
          sourceItems: [],
          diceGroups,
          arithmeticSteps: [],
          comparisons: [],
          total: evaluated.total,
          createdAt: Date.now(),
          origin: 'modifier',
        }, standardStyles);
        ingestRoll(formulaResult);
        dispatchRoll(formulaResult);
        return formulaResult;
      }
    }
    const parsed = parseModifierValue(input.expression);
    if (!parsed) return null;
    // Valore numerico semplice (senza "d" da nessuna parte): non e' un dado,
    // quindi non crea tiri in chat.
    if (parsed.kind === 'number') return null;
    // Piu' dadi o dadi con segno (es. "2d6-1d4", "1d6 danni 1d4"): gruppi
    // manuali, ogni segno contribuisce col proprio verso.
    if (parsed.dice.length > 1 || parsed.dice[0].sign < 0) {
      const manualId = globalThis.crypto.randomUUID();
      const manualGroups: RollDiceGroup[] = [];
      let manualTotal = parsed.modifier;
      parsed.dice.forEach((token, tokenIndex) => {
        const faces: number[] = [];
        for (let rollIndex = 0; rollIndex < token.count; rollIndex += 1) {
          faces.push(cryptoDiceRng(token.sides));
        }
        const groupSum = faces.reduce((sum, face) => sum + face, 0);
        manualTotal += token.sign * groupSum;
        manualGroups.push({
          itemId: `modifier-v${tokenIndex + 1}`,
          sides: token.sides,
          requestedQuantity: token.count,
          rolls: faces.map((face, dieIndex) => ({
            id: `${manualId}:v${tokenIndex + 1}r${dieIndex + 1}`,
            groupItemId: `modifier-v${tokenIndex + 1}`,
            sides: token.sides,
            face,
            contribution: token.sign * face,
            active: true,
            source: 'base' as const,
            explosionDepth: 0,
            chainId: `${manualId}:vchain${tokenIndex + 1}`,
          })),
          activeRollIds: faces.map((_, dieIndex) => `${manualId}:v${tokenIndex + 1}r${dieIndex + 1}`),
          contribution: token.sign * groupSum,
        });
      });
      if (!Number.isFinite(manualTotal)) return null;
      const display = formula || input.expression.trim();
      const manualResult: RollResult = attachDiceAppearanceSnapshots({
        id: manualId,
        campaignId: activeCampaign.id,
        rollerId: user.id,
        rollerName: user.displayName,
        rollerAvatarUrl: user.avatarUrl,
        formulaName: input.name,
        formulaText: display,
        visibility: 'public',
        sourceItems: [],
        diceGroups: manualGroups,
        arithmeticSteps: [],
        comparisons: [],
        total: manualTotal,
        createdAt: Date.now(),
        origin: 'modifier',
      }, standardStyles);
      ingestRoll(manualResult);
      dispatchRoll(manualResult);
      return manualResult;
    }
    // Singolo dado positivo: motore standard (snapshot apparenze incluso).
    const dice = parsed.dice[0];
    const diceItemId = globalThis.crypto.randomUUID();
    const items: DiceRollRequest['items'] = [{ id: diceItemId, kind: 'dice', sides: dice.sides, quantity: dice.count }];
    if (parsed.modifier !== 0) {
      items.push({
        id: globalThis.crypto.randomUUID(),
        kind: 'modifier',
        operation: parsed.modifier > 0 ? 'add' : 'subtract',
        value: Math.abs(parsed.modifier),
      });
    }
    const base = buildResult({ items, formulaName: input.name, visibility: 'public' });
    // In chat, sotto al nome: esattamente il campo Valore se non c'e' la
    // Formula, altrimenti la Formula al suo posto.
    const result: RollResult = {
      ...base,
      formulaText: formula || input.expression.trim(),
      origin: 'modifier',
    };
    ingestRoll(result);
    dispatchRoll(result);
    return result;
  }, [activeCampaign, buildResult, dispatchRoll, ingestRoll, standardStyles, user]);

  const submitInlineCustomDieRoll = useCallback((input: InlineCustomDieRollSubmit) => {
    if (!user || !activeCampaign) return null;
    const maxQuantity = getCustomDieQuickRollMax(input.customDie);
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > maxQuantity) return null;
    const base = buildResult({
      items: [{
        id: globalThis.crypto.randomUUID(),
        kind: 'custom-die',
        customDieId: input.customDie.id,
        quantity: input.quantity,
        customDie: input.customDie,
      }],
      formulaName: input.name,
      visibility: 'public',
    });
    const result: RollResult = { ...base, origin: 'modifier' };
    ingestRoll(result);
    dispatchRoll(result);
    return result;
  }, [activeCampaign, buildResult, dispatchRoll, ingestRoll, user]);

  const rolls = useMemo(
    () => entries.filter((entry) => entry.revealState === 'revealed').map((entry) => entry.result),
    [entries],
  );

  const rerollResult = useCallback((previous: RollResult): RollResult | null => {
    return submitLocalRoll({
      items: previous.sourceItems.map((item) => item.kind === 'custom-die'
        ? {
          ...item,
          customDie: {
            ...item.customDie,
            faces: item.customDie.faces.map((face) => ({ ...face, visual: { ...face.visual } })),
          },
        }
        : { ...item }) as DiceRollRequest['items'],
      formulaId: previous.formulaId,
      formulaName: previous.formulaName,
      formulaIconName: previous.formulaIconName,
      visibility: previous.visibility,
    });
  }, [submitLocalRoll]);

  const reroll = useCallback((resultId: string) => {
    const previous = rolls.find((roll) => roll.id === resultId);
    return previous ? rerollResult(previous) : null;
  }, [rolls, rerollResult]);

  const clearLocalHistory = useCallback(() => {
    stopActiveAnimation(false);
    // I tiri ancora in rotolamento non devono finire in chat dopo un
    // "Pulisci": la coda di attesa va svuotata insieme alle entry.
    pendingChatRolls.current.clear();
    setEntries([]);
    setHistoryUnread(false);
  }, [stopActiveAnimation]);

  const value = useMemo<DiceSessionValue>(() => ({
    rolls,
    submitLocalRoll,
    submitModifierRoll,
    submitInlineCustomDieRoll,
    reroll,
    rerollResult,
    clearLocalHistory,
    historyOpen,
    historyUnread,
    setHistoryOpen,
    openHistory,
    closeHistory,
    markHistoryRead,
    animationsEnabled: animationsEnabledState,
    setAnimationsEnabled,
    setAnimationContainer,
  }), [
    animationsEnabledState,
    clearLocalHistory,
    closeHistory,
    historyOpen,
    historyUnread,
    markHistoryRead,
    openHistory,
    reroll,
    rerollResult,
    rolls,
    setAnimationContainer,
    setAnimationsEnabled,
    setHistoryOpen,
    submitLocalRoll,
    submitInlineCustomDieRoll,
    submitModifierRoll,
  ]);

  return <DiceSessionContext.Provider value={value}>{children}</DiceSessionContext.Provider>;
}

export function DiceSessionProvider({ children, onRollIngested }: DiceSessionProviderProps) {
  return (
    <DiceAppearanceProvider>
      <DiceSessionProviderBody onRollIngested={onRollIngested}>{children}</DiceSessionProviderBody>
    </DiceAppearanceProvider>
  );
}

export function useDiceSession() {
  const context = useContext(DiceSessionContext);
  if (!context) throw new Error('useDiceSession deve essere usato dentro DiceSessionProvider.');
  return context;
}

/** Variante tollerante per i bridge montati anche fuori sessione dadi. */
export function useOptionalDiceSession() {
  return useContext(DiceSessionContext);
}
