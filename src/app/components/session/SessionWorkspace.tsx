import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Lock,
  Map,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Square,
  Unlock,
} from "lucide-react";
import { buildActiveScenePublication } from "../../../services/campaign/activeScene";
import {
  buildSceneEncounter,
  type ActiveEncounter,
} from "../../../services/campaign/sceneEncounter";
import {
  loadChapters,
  loadScenes,
} from "../../../services/supabase/entitiesService";
import type { ActiveScenePublication } from "../../../types/activeScene";
import type { Chapter } from "../../../types/chapter";
import type { Scene } from "../../../types/scene";
import { ActiveSceneMap } from "./ActiveSceneMap";
import { MapViewport, type MapPlacement } from "./MapViewport";
import {
  configureSessionGrid,
  configureSessionMapDrawingClear,
  configureSessionMapHistory,
  DEFAULT_SESSION_GRID,
  setSessionMapCurrentUserId,
  type SessionGridSettings,
} from "./mapToolStore";
import { useActiveScene } from "./useActiveScene";
import { useCampaignDocument } from "../shared/useCampaignDocument";
import type {
  SessionMapToken,
  SessionMapTokenVisual,
} from "../../../types/sessionMapToken";
import type { SessionMapDrawing } from "../../../types/sessionMapDrawing";
import type { SessionMapPoi } from "../../../types/sessionMapPoi";
import type { SessionMapFog } from "../../../types/sessionMapFog";
import {
  filterMapObjectOrder,
  doBoundsOverlap,
  getRotatedRectBounds,
  getRotatedSquareBounds,
  moveMapObjectBlock,
  reconcileMapObjectOrder,
  type MapLayerMove,
  type MapObjectRef,
} from "./mapObjectLayers";
import { useCampaignChannel } from "../../../services/realtime/campaignChannel";

const TREE_WIDTH_STORAGE_KEY = "hollowgate.session.tree-width";
const TREE_DEFAULT_WIDTH = 280;
const TREE_MIN_WIDTH = 220;
const TREE_MAX_WIDTH = 480;
const MAP_HISTORY_LIMIT = 50;

type SessionMapHistorySnapshot = {
  placement: MapPlacement;
  grid: SessionGridSettings;
  tokens: SessionMapToken[];
  drawings: SessionMapDrawing[];
  pois: SessionMapPoi[];
  fog: SessionMapFog[];
  objectOrder: MapObjectRef[];
};

type SessionMapHistory = {
  past: SessionMapHistorySnapshot[];
  future: SessionMapHistorySnapshot[];
};

function readTreeWidth() {
  if (typeof window === "undefined") return TREE_DEFAULT_WIDTH;
  const stored = Number(window.localStorage.getItem(TREE_WIDTH_STORAGE_KEY));
  return Number.isFinite(stored) &&
    stored >= TREE_MIN_WIDTH &&
    stored <= TREE_MAX_WIDTH
    ? stored
    : TREE_DEFAULT_WIDTH;
}

function chapterPreview(
  chapter: Chapter,
  mapPlacement?: MapPlacement,
): ActiveScenePublication {
  return {
    id: `chapter:${chapter.id}`,
    campaignId: chapter.campaignId,
    sceneId: "",
    chapterId: chapter.id,
    title: chapter.title,
    description: chapter.description,
    chapterTitle: chapter.title,
    mapUrl: chapter.mapUrl,
    sceneImageUrl: null,
    mapMetadata: chapter.mapMetadata,
    mapPlacement,
    mapRegions: [],
    contextMetadata: { timeOfDay: "", period: "", condition: "" },
    publishedAt: chapter.updatedAt,
  };
}

function publicMapTokens(tokens: SessionMapToken[]) {
  return tokens.filter(
    (token) => !token.hiddenFromPlayers && token.visible !== false,
  );
}

function publicMapDrawings(drawings: SessionMapDrawing[]) {
  return drawings.filter((drawing) => drawing.visible !== false);
}
function publicMapPois(pois: SessionMapPoi[]) {
  return pois
    .filter((poi) => poi.visibleToPlayers)
    .map((poi) => ({
      ...poi,
      noteId: poi.noteVisibleToPlayers ? poi.noteId : null,
    }));
}

function reconcileOrder(order: MapObjectRef[] | undefined, drawings: SessionMapDrawing[], tokens: SessionMapToken[], pois: SessionMapPoi[]) {
  return reconcileMapObjectOrder(order, [['drawing', drawings], ['token', tokens], ['poi', pois]]);
}

function publicMapObjectOrder(order: MapObjectRef[], drawings: SessionMapDrawing[], tokens: SessionMapToken[], pois: SessionMapPoi[]) {
  return filterMapObjectOrder(order, [
    ...publicMapDrawings(drawings).map(({ id }) => ({ family: 'drawing', id })),
    ...publicMapTokens(tokens).map(({ id }) => ({ family: 'token', id })),
    ...publicMapPois(pois).map(({ id }) => ({ family: 'poi', id })),
  ]);
}

export function SessionWorkspace({
  campaignId,
  campaignName,
  campaignLogoUrl,
  isOwner,
  currentUserId = null,
  currentUserAccessToken = null,
  onEndSession,
}: {
  campaignId: string;
  campaignName: string;
  campaignLogoUrl?: string | null;
  isOwner: boolean;
  currentUserId?: string | null;
  currentUserAccessToken?: string | null;
  onEndSession: () => Promise<void>;
}) {
  setSessionMapCurrentUserId(currentUserId);
  const { activeScene, channelReady, publish } = useActiveScene(campaignId);
  const playerMapActionHandlerRef = useRef<(payload: any) => void>(() => {});
  const playerMapPoiActionHandlerRef = useRef<(payload: any) => void>(() => {});
  const playerMapLayerActionHandlerRef = useRef<(payload: any) => void>(() => {});
  const { send: sendCampaignEvent } = useCampaignChannel(campaignId, {
    onBroadcast: {
      map_token_action: (message) => {
        if (isOwner) playerMapActionHandlerRef.current(message?.payload);
      },
      map_poi_action: (message) => {
        if (isOwner) playerMapPoiActionHandlerRef.current(message?.payload);
      },
      map_object_layer_action: (message) => {
        if (isOwner) playerMapLayerActionHandlerRef.current(message?.payload);
      },
    },
  });
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(
    null,
  );
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(isOwner);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [encounterBusyId, setEncounterBusyId] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [activeEncounter, setActiveEncounter] =
    useCampaignDocument<ActiveEncounter | null>("active-encounter", null, {
      enabled: isOwner,
      deleteWhenNull: true,
    });
  const [mapPlacements, setMapPlacements] = useCampaignDocument<
    Record<string, MapPlacement>
  >("session-map-placements", {});
  const [chapterGrids, setChapterGrids] = useCampaignDocument<
    Record<string, SessionGridSettings>
  >("session-map-grids", {});
  const [chapterTokens, setChapterTokens] = useCampaignDocument<
    Record<string, SessionMapToken[]>
  >("session-map-tokens", {});
  const [chapterDrawings, setChapterDrawings] = useCampaignDocument<
    Record<string, SessionMapDrawing[]>
  >("session-map-drawings", {});
  const [chapterPois, setChapterPois] = useCampaignDocument<
    Record<string, SessionMapPoi[]>
  >("session-map-pois", {});
  const [chapterFog, setChapterFog] = useCampaignDocument<
    Record<string, SessionMapFog[]>
  >("session-map-fog", {});
  const [chapterObjectOrders, setChapterObjectOrders] = useCampaignDocument<Record<string, MapObjectRef[]>>(
    "session-map-object-order",
    {},
  );
  const [treeWidth, setTreeWidth] = useState(readTreeWidth);
  const [treeHidden, setTreeHidden] = useState(false);
  const [resizingTree, setResizingTree] = useState(false);
  const treeResizeRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const sessionChapterPublishedRef = useRef(false);
  const mapHistoryRef = useRef(new globalThis.Map<string, SessionMapHistory>());
  const [mapHistoryVersion, setMapHistoryVersion] = useState(0);

  useEffect(() => {
    const syncQuickRollEdge = () => {
      document.documentElement.style.setProperty(
        "--session-tree-edge",
        isOwner && !treeHidden && window.innerWidth >= 768
          ? `${treeWidth}px`
          : "0px",
      );
    };
    syncQuickRollEdge();
    window.addEventListener("resize", syncQuickRollEdge);
    try {
      window.localStorage.setItem(
        TREE_WIDTH_STORAGE_KEY,
        String(Math.round(treeWidth)),
      );
    } catch {
      /* Resize still works without storage. */
    }
    return () => {
      window.removeEventListener("resize", syncQuickRollEdge);
      document.documentElement.style.removeProperty("--session-tree-edge");
    };
  }, [isOwner, treeHidden, treeWidth]);

  useEffect(() => {
    let cancelled = false;
    if (!isOwner) {
      setChapters([]);
      setScenes([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    void Promise.all([loadChapters(campaignId), loadScenes(campaignId)])
      .then(([nextChapters, nextScenes]) => {
        if (cancelled) return;
        setChapters(nextChapters);
        setScenes(nextScenes);
        setSelectedChapterId(
          (current) =>
            current ??
            nextChapters.find((chapter) => chapter.isActive)?.id ??
            activeScene?.chapterId ??
            nextChapters[0]?.id ??
            null,
        );
        setSelectedSceneId(null);
      })
      .catch((error) =>
        console.error("Caricamento albero sessione non riuscito:", error),
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, isOwner]);

  useEffect(() => {
    if (
      !isOwner ||
      !channelReady ||
      loading ||
      sessionChapterPublishedRef.current
    )
      return;
    const chapter =
      chapters.find((item) => item.isActive) ??
      chapters.find((item) => item.id === activeScene?.chapterId) ??
      chapters[0];
    if (!chapter) return;
    sessionChapterPublishedRef.current = true;
    setSelectedChapterId(chapter.id);
    setSelectedSceneId(null);
    const placement = mapPlacements[chapter.id] ??
      (activeScene?.chapterId === chapter.id
        ? activeScene.mapPlacement
        : undefined) ?? { x: 0, y: 0, locked: false };
    const tokens =
      chapterTokens[chapter.id] ??
      (activeScene?.chapterId === chapter.id
        ? activeScene.mapTokens
        : undefined) ??
      [];
    const drawings =
      chapterDrawings[chapter.id] ??
      (activeScene?.chapterId === chapter.id
        ? activeScene.mapDrawings
        : undefined) ??
      [];
    const pois =
      chapterPois[chapter.id] ??
      (activeScene?.chapterId === chapter.id
        ? activeScene.mapPois
        : undefined) ??
      [];
    const fog =
      chapterFog[chapter.id] ??
      (activeScene?.chapterId === chapter.id ? activeScene.mapFog : undefined) ??
      [];
    const objectOrder = reconcileOrder(chapterObjectOrders[chapter.id] ?? activeScene?.mapObjectOrder, drawings, tokens, pois);
    void publish({
      ...chapterPreview(chapter, placement),
      gridSettings: chapterGrids[chapter.id] ?? DEFAULT_SESSION_GRID,
      mapTokens: publicMapTokens(tokens),
      mapDrawings: publicMapDrawings(drawings),
      mapPois: publicMapPois(pois),
      mapFog: fog,
      mapObjectOrder: publicMapObjectOrder(objectOrder, drawings, tokens, pois),
    }).catch((error) => {
      sessionChapterPublishedRef.current = false;
      console.error("Pubblicazione Capitolo iniziale non riuscita:", error);
    });
  }, [
    activeScene?.chapterId,
    channelReady,
    chapterDrawings,
    chapterGrids,
    chapterFog,
    chapterPois,
    chapterTokens,
    chapterObjectOrders,
    chapters,
    isOwner,
    loading,
    mapPlacements,
    publish,
  ]);

  const orderedChapters = useMemo(
    () =>
      [...chapters].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return (
          a.createdAt.localeCompare(b.createdAt) ||
          a.title.localeCompare(b.title, "it")
        );
      }),
    [chapters],
  );
  const selectedChapter =
    chapters.find((chapter) => chapter.id === selectedChapterId) ?? null;
  const selectedScene =
    scenes.find((scene) => scene.id === selectedSceneId) ?? null;
  const publicChapterPreview = activeScene
    ? {
        ...activeScene,
        id: `chapter:${activeScene.chapterId}`,
        sceneId: "",
        title: activeScene.chapterTitle,
        description: "",
        sceneImageUrl: null,
        mapRegions: [],
        contextMetadata: { timeOfDay: "", period: "", condition: "" },
      }
    : null;
  const display =
    selectedScene && selectedChapter
      ? {
          ...buildActiveScenePublication(
            campaignId,
            selectedScene,
            selectedChapter,
          ),
          mapPlacement:
            mapPlacements[selectedChapter.id] ??
            (activeScene?.chapterId === selectedChapter.id
              ? activeScene.mapPlacement
              : undefined),
          gridSettings:
            chapterGrids[selectedChapter.id] ??
            (activeScene?.chapterId === selectedChapter.id
              ? activeScene.gridSettings
              : undefined) ??
            DEFAULT_SESSION_GRID,
          mapTokens:
            chapterTokens[selectedChapter.id] ??
            (activeScene?.chapterId === selectedChapter.id
              ? activeScene.mapTokens
              : undefined) ??
            [],
          mapDrawings:
            chapterDrawings[selectedChapter.id] ??
            (activeScene?.chapterId === selectedChapter.id
              ? activeScene.mapDrawings
              : undefined) ??
            [],
          mapPois:
            chapterPois[selectedChapter.id] ??
            (activeScene?.chapterId === selectedChapter.id
              ? activeScene.mapPois
              : undefined) ??
            [],
          mapFog:
            chapterFog[selectedChapter.id] ??
            (activeScene?.chapterId === selectedChapter.id
              ? activeScene.mapFog
              : undefined) ??
            [],
          mapObjectOrder: reconcileOrder(
            chapterObjectOrders[selectedChapter.id] ?? (activeScene?.chapterId === selectedChapter.id ? activeScene.mapObjectOrder : undefined),
            chapterDrawings[selectedChapter.id] ?? (activeScene?.chapterId === selectedChapter.id ? activeScene.mapDrawings : undefined) ?? [],
            chapterTokens[selectedChapter.id] ?? (activeScene?.chapterId === selectedChapter.id ? activeScene.mapTokens : undefined) ?? [],
            chapterPois[selectedChapter.id] ?? (activeScene?.chapterId === selectedChapter.id ? activeScene.mapPois : undefined) ?? [],
          ),
        }
      : selectedChapter
        ? {
            ...chapterPreview(
              selectedChapter,
              mapPlacements[selectedChapter.id] ??
                (activeScene?.chapterId === selectedChapter.id
                  ? activeScene.mapPlacement
                  : undefined),
            ),
            gridSettings:
              chapterGrids[selectedChapter.id] ??
              (activeScene?.chapterId === selectedChapter.id
                ? activeScene.gridSettings
                : undefined) ??
              DEFAULT_SESSION_GRID,
            mapTokens:
              chapterTokens[selectedChapter.id] ??
              (activeScene?.chapterId === selectedChapter.id
                ? activeScene.mapTokens
                : undefined) ??
              [],
            mapDrawings:
              chapterDrawings[selectedChapter.id] ??
              (activeScene?.chapterId === selectedChapter.id
                ? activeScene.mapDrawings
                : undefined) ??
              [],
            mapPois:
              chapterPois[selectedChapter.id] ??
              (activeScene?.chapterId === selectedChapter.id
                ? activeScene.mapPois
                : undefined) ??
              [],
            mapFog:
              chapterFog[selectedChapter.id] ??
              (activeScene?.chapterId === selectedChapter.id
                ? activeScene.mapFog
                : undefined) ??
              [],
            mapObjectOrder: reconcileOrder(
              chapterObjectOrders[selectedChapter.id] ?? (activeScene?.chapterId === selectedChapter.id ? activeScene.mapObjectOrder : undefined),
              chapterDrawings[selectedChapter.id] ?? (activeScene?.chapterId === selectedChapter.id ? activeScene.mapDrawings : undefined) ?? [],
              chapterTokens[selectedChapter.id] ?? (activeScene?.chapterId === selectedChapter.id ? activeScene.mapTokens : undefined) ?? [],
              chapterPois[selectedChapter.id] ?? (activeScene?.chapterId === selectedChapter.id ? activeScene.mapPois : undefined) ?? [],
            ),
          }
        : publicChapterPreview;
  const mapPlacement: MapPlacement = display?.mapPlacement ?? {
    x: 0,
    y: 0,
    locked: false,
  };
  const currentMapSnapshot = (): SessionMapHistorySnapshot => ({
    placement: structuredClone(mapPlacement),
    grid: structuredClone(display?.gridSettings ?? DEFAULT_SESSION_GRID),
    tokens: structuredClone(display?.mapTokens ?? []),
    drawings: structuredClone(display?.mapDrawings ?? []),
    pois: structuredClone(display?.mapPois ?? []),
    fog: structuredClone(display?.mapFog ?? []),
    objectOrder: structuredClone(display?.mapObjectOrder ?? []),
  });
  const recordMapHistory = () => {
    if (!isOwner || !display) return;
    const history = mapHistoryRef.current.get(display.chapterId) ?? {
      past: [],
      future: [],
    };
    const snapshot = currentMapSnapshot();
    if (JSON.stringify(history.past.at(-1)) !== JSON.stringify(snapshot))
      history.past = [...history.past, snapshot].slice(-MAP_HISTORY_LIMIT);
    history.future = [];
    mapHistoryRef.current.set(display.chapterId, history);
    setMapHistoryVersion((version) => version + 1);
  };
  const applyMapHistorySnapshot = (snapshot: SessionMapHistorySnapshot) => {
    if (!isOwner || !display) return;
    const chapterId = display.chapterId;
    setMapPlacements((current) => ({
      ...current,
      [chapterId]: structuredClone(snapshot.placement),
    }));
    setChapterGrids((current) => ({
      ...current,
      [chapterId]: structuredClone(snapshot.grid),
    }));
    setChapterTokens((current) => ({
      ...current,
      [chapterId]: structuredClone(snapshot.tokens),
    }));
    setChapterDrawings((current) => ({
      ...current,
      [chapterId]: structuredClone(snapshot.drawings),
    }));
    setChapterPois((current) => ({
      ...current,
      [chapterId]: structuredClone(snapshot.pois),
    }));
    setChapterFog((current) => ({
      ...current,
      [chapterId]: structuredClone(snapshot.fog),
    }));
    setChapterObjectOrders((current) => ({ ...current, [chapterId]: structuredClone(snapshot.objectOrder) }));
    if (channelReady)
      void publish({
        ...display,
        mapPlacement: snapshot.placement,
        gridSettings: snapshot.grid,
        mapTokens: publicMapTokens(snapshot.tokens),
        mapDrawings: publicMapDrawings(snapshot.drawings),
        mapPois: publicMapPois(snapshot.pois),
        mapFog: snapshot.fog,
        mapObjectOrder: publicMapObjectOrder(snapshot.objectOrder, snapshot.drawings, snapshot.tokens, snapshot.pois),
        publishedAt: new Date().toISOString(),
      });
  };
  const undoMapChange = () => {
    if (!display) return;
    const history = mapHistoryRef.current.get(display.chapterId);
    const snapshot = history?.past.pop();
    if (!history || !snapshot) return;
    history.future = [...history.future, currentMapSnapshot()].slice(
      -MAP_HISTORY_LIMIT,
    );
    mapHistoryRef.current.set(display.chapterId, history);
    applyMapHistorySnapshot(snapshot);
    setMapHistoryVersion((version) => version + 1);
  };
  const redoMapChange = () => {
    if (!display) return;
    const history = mapHistoryRef.current.get(display.chapterId);
    const snapshot = history?.future.pop();
    if (!history || !snapshot) return;
    history.past = [...history.past, currentMapSnapshot()].slice(
      -MAP_HISTORY_LIMIT,
    );
    mapHistoryRef.current.set(display.chapterId, history);
    applyMapHistorySnapshot(snapshot);
    setMapHistoryVersion((version) => version + 1);
  };
  useEffect(() => {
    const history = display
      ? mapHistoryRef.current.get(display.chapterId)
      : undefined;
    configureSessionMapHistory(
      isOwner && display ? undoMapChange : null,
      isOwner && display ? redoMapChange : null,
      Boolean(history?.past.length),
      Boolean(history?.future.length),
    );
    return () => configureSessionMapHistory(null, null, false, false);
  }, [
    display?.chapterId,
    display?.mapPlacement,
    display?.gridSettings,
    display?.mapTokens,
    display?.mapDrawings,
    display?.mapPois,
    display?.mapFog,
    display?.mapObjectOrder,
    isOwner,
    mapHistoryVersion,
  ]);
  const requestMapTokenAction = (
    action: string,
    data: Record<string, unknown>,
  ) => {
    if (!display) return;
    void sendCampaignEvent("map_token_action", {
      action,
      chapterId: display.chapterId,
      actorProfileId: currentUserId,
      ...data,
    });
  };
  const requestMapPoiAction = (
    action: string,
    data: Record<string, unknown>,
  ) => {
    if (display)
      void sendCampaignEvent("map_poi_action", {
        action,
        chapterId: display.chapterId,
        actorProfileId: currentUserId,
        ...data,
      });
  };
  const chooseScene = async (scene: Scene, chapter: Chapter) => {
    setSelectedChapterId(chapter.id);
    setSelectedSceneId(scene.id);
    if (scene.status !== "ready" || !channelReady) return;
    setPublishingId(scene.id);
    try {
      const tokens =
        chapterTokens[chapter.id] ??
        (activeScene?.chapterId === chapter.id
          ? activeScene.mapTokens
          : undefined) ??
        [];
      const drawings =
        chapterDrawings[chapter.id] ??
        (activeScene?.chapterId === chapter.id
          ? activeScene.mapDrawings
          : undefined) ??
        [];
      const pois =
        chapterPois[chapter.id] ??
        (activeScene?.chapterId === chapter.id
          ? activeScene.mapPois
          : undefined) ??
        [];
      const fog =
        chapterFog[chapter.id] ??
        (activeScene?.chapterId === chapter.id ? activeScene.mapFog : undefined) ??
        [];
      const objectOrder = reconcileOrder(chapterObjectOrders[chapter.id] ?? activeScene?.mapObjectOrder, drawings, tokens, pois);
      await publish({
        ...buildActiveScenePublication(campaignId, scene, chapter),
        mapPlacement: mapPlacements[chapter.id] ?? {
          x: 0,
          y: 0,
          locked: false,
        },
        gridSettings: chapterGrids[chapter.id] ?? DEFAULT_SESSION_GRID,
        mapTokens: publicMapTokens(tokens),
        mapDrawings: publicMapDrawings(drawings),
        mapPois: publicMapPois(pois),
        mapFog: fog,
        mapObjectOrder: publicMapObjectOrder(objectOrder, drawings, tokens, pois),
      });
    } catch (error) {
      console.error("Pubblicazione Scena dalla sessione non riuscita:", error);
    } finally {
      setPublishingId(null);
    }
  };

  const updateMapPlacement = (
    placement: MapPlacement,
    recordHistory = true,
  ) => {
    if (!isOwner || !display) return;
    if (recordHistory) recordMapHistory();
    setMapPlacements((current) => ({
      ...current,
      [display.chapterId]: placement,
    }));
    if (channelReady)
      void publish({
        ...display,
        mapPlacement: placement,
        publishedAt: new Date().toISOString(),
      });
  };

  const updateGridSettings = (
    settings: SessionGridSettings,
    recordHistory = true,
  ) => {
    if (!isOwner || !display) return;
    if (recordHistory) recordMapHistory();
    setChapterGrids((current) => ({
      ...current,
      [display.chapterId]: settings,
    }));
    if (channelReady)
      void publish({
        ...display,
        gridSettings: settings,
        publishedAt: new Date().toISOString(),
      });
  };

  const updateMapTokens = (tokens: SessionMapToken[], recordHistory = true) => {
    if (!isOwner || !display) return;
    if (recordHistory) recordMapHistory();
    const drawings = display.mapDrawings ?? [];
    const pois = display.mapPois ?? [];
    const objectOrder = reconcileOrder(display.mapObjectOrder, drawings, tokens, pois);
    setChapterTokens((current) => ({
      ...current,
      [display.chapterId]: tokens,
    }));
    setChapterObjectOrders((current) => ({ ...current, [display.chapterId]: objectOrder }));
    if (channelReady)
      void publish({
        ...display,
        mapTokens: publicMapTokens(tokens),
        mapObjectOrder: publicMapObjectOrder(objectOrder, drawings, tokens, pois),
        publishedAt: new Date().toISOString(),
      });
  };

  const updateMapDrawings = (
    drawings: SessionMapDrawing[],
    recordHistory = true,
  ) => {
    if (!isOwner || !display) return;
    if (recordHistory) recordMapHistory();
    const tokens = display.mapTokens ?? [];
    const pois = display.mapPois ?? [];
    const objectOrder = reconcileOrder(display.mapObjectOrder, drawings, tokens, pois);
    setChapterDrawings((current) => ({
      ...current,
      [display.chapterId]: drawings,
    }));
    setChapterObjectOrders((current) => ({ ...current, [display.chapterId]: objectOrder }));
    if (channelReady)
      void publish({
        ...display,
        mapDrawings: publicMapDrawings(drawings),
        mapObjectOrder: publicMapObjectOrder(objectOrder, drawings, tokens, pois),
        publishedAt: new Date().toISOString(),
      });
  };

  const updateMapFog = (fog: SessionMapFog[], recordHistory = true) => {
    if (!isOwner || !display) return;
    if (recordHistory) recordMapHistory();
    setChapterFog((current) => ({
      ...current,
      [display.chapterId]: fog,
    }));
    if (channelReady)
      void publish({
        ...display,
        mapFog: fog,
        publishedAt: new Date().toISOString(),
      });
  };

  const addMapFog = (fog: SessionMapFog) => {
    if (!isOwner) return;
    updateMapFog([...(display?.mapFog ?? []), fog]);
  };
  const changeMapFog = (id: string, update: Partial<SessionMapFog>) => {
    if (!isOwner) return;
    const now = new Date().toISOString();
    updateMapFog(
      (display?.mapFog ?? []).map((item) =>
        item.id === id ? { ...item, ...update, updatedAt: now } : item,
      ),
    );
  };
  const changeMapFogBatch = (
    ids: string[],
    update: Partial<SessionMapFog>,
  ) => {
    if (!isOwner) return;
    const selected = new Set(ids);
    const now = new Date().toISOString();
    updateMapFog(
      (display?.mapFog ?? []).map((item) =>
        selected.has(item.id) ? { ...item, ...update, updatedAt: now } : item,
      ),
    );
  };
  const transformMapFog = (
    updates: Record<string, Partial<SessionMapFog>>,
  ) => {
    if (!isOwner) return;
    const now = new Date().toISOString();
    updateMapFog(
      (display?.mapFog ?? []).map((item) =>
        updates[item.id]
          ? { ...item, ...updates[item.id], updatedAt: now }
          : item,
      ),
    );
  };
  const deleteMapFog = (id: string) => {
    if (!isOwner) return;
    updateMapFog((display?.mapFog ?? []).filter((item) => item.id !== id));
  };
  const deleteMapFogBatch = (ids: string[]) => {
    if (!isOwner) return;
    const selected = new Set(ids);
    updateMapFog(
      (display?.mapFog ?? []).filter((item) => !selected.has(item.id)),
    );
  };

  const updateMapPois = (pois: SessionMapPoi[], recordHistory = true) => {
    if (!isOwner || !display) return;
    if (recordHistory) recordMapHistory();
    const drawings = display.mapDrawings ?? [];
    const tokens = display.mapTokens ?? [];
    const objectOrder = reconcileOrder(display.mapObjectOrder, drawings, tokens, pois);
    setChapterPois((current) => ({ ...current, [display.chapterId]: pois }));
    setChapterObjectOrders((current) => ({ ...current, [display.chapterId]: objectOrder }));
    if (channelReady)
      void publish({
        ...display,
        mapPois: publicMapPois(pois),
        mapObjectOrder: publicMapObjectOrder(objectOrder, drawings, tokens, pois),
        publishedAt: new Date().toISOString(),
      });
  };
  const moveMapObjectLayer = (refs: MapObjectRef[], move: MapLayerMove, actorProfileId = currentUserId) => {
    if (!display || refs.length === 0) return;
    if (!isOwner) {
      void sendCampaignEvent("map_object_layer_action", { chapterId: display.chapterId, actorProfileId, refs, move });
      return;
    }
    const objects = new globalThis.Map<string, SessionMapDrawing | SessionMapToken | SessionMapPoi>([
      ...(display.mapDrawings ?? []).map((object) => [`drawing\u0000${object.id}`, object] as const),
      ...(display.mapTokens ?? []).map((object) => [`token\u0000${object.id}`, object] as const),
      ...(display.mapPois ?? []).map((object) => [`poi\u0000${object.id}`, object] as const),
    ]);
    const allowed = refs.filter((ref) => {
      const object = objects.get(`${ref.family}\u0000${ref.id}`);
      return object && !object.pinned && (actorProfileId === currentUserId || (!object.locked && object.createdByProfileId === actorProfileId));
    });
    if (allowed.length !== refs.length) return;
    const current = reconcileOrder(display.mapObjectOrder, display.mapDrawings ?? [], display.mapTokens ?? [], display.mapPois ?? []);
    const boundsFor = (ref: MapObjectRef) => {
      if (ref.family === 'drawing') {
        const drawing = (display.mapDrawings ?? []).find(item => item.id === ref.id);
        return drawing ? getRotatedRectBounds(drawing, drawing.width, drawing.height, drawing.rotation ?? 0) : null;
      }
      if (ref.family === 'token') {
        const token = (display.mapTokens ?? []).find(item => item.id === ref.id);
        const size = token?.size ?? display.gridSettings?.cellSize ?? DEFAULT_SESSION_GRID.cellSize;
        return token ? getRotatedSquareBounds(token, size, token.rotation ?? 0) : null;
      }
      const poi = (display.mapPois ?? []).find(item => item.id === ref.id);
      return poi ? getRotatedSquareBounds({ x: poi.x - poi.size / 2, y: poi.y - poi.size / 2 }, poi.size, poi.rotation ?? 0) : null;
    };
    const next = moveMapObjectBlock(current, allowed, move, (first, second) => {
      const firstBounds = boundsFor(first);
      const secondBounds = boundsFor(second);
      return !!firstBounds && !!secondBounds && doBoundsOverlap(firstBounds, secondBounds);
    });
    if (next === current) return;
    recordMapHistory();
    setChapterObjectOrders((orders) => ({ ...orders, [display.chapterId]: next }));
    if (channelReady) void publish({
      ...display,
      mapObjectOrder: publicMapObjectOrder(next, display.mapDrawings ?? [], display.mapTokens ?? [], display.mapPois ?? []),
      publishedAt: new Date().toISOString(),
    });
  };
  const addMapPoi = (
    position: { x: number; y: number },
    creatorProfileId = currentUserId,
  ) => {
    if (!display) return;
    if (!isOwner) {
      requestMapPoiAction("create", { position });
      return;
    }
    const now = new Date().toISOString();
    const previousSize = display.mapPois?.at(-1)?.size ?? 44;
    updateMapPois([
      ...(display.mapPois ?? []),
      {
        id: crypto.randomUUID(),
        ...position,
        iconName: "MapPin",
        color: "#ef4444",
        visibleToPlayers: true,
        locked: false,
        pinned: false,
        size: previousSize,
        rotation: 0,
        lightRadius: 0,
        lightConfig: {},
        noteId: null,
        noteVisibleToPlayers: false,
        label: "Punto di interesse",
        labelVisible: false,
        createdByProfileId: creatorProfileId,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  };
  const moveMapPoi = (poiId: string, position: { x: number; y: number }) => {
    if (!display) return;
    if (!isOwner) {
      requestMapPoiAction("move", { poiId, position });
      return;
    }
    const now = new Date().toISOString();
    updateMapPois(
      (display.mapPois ?? []).map((poi) =>
        poi.id === poiId && !poi.pinned
          ? { ...poi, ...position, updatedAt: now }
          : poi,
      ),
    );
  };
  const changeMapPoi = (poiId: string, update: Partial<SessionMapPoi>) => {
    if (!display) return;
    if (!isOwner) {
      requestMapPoiAction("update", { poiId, update });
      return;
    }
    const unpinning =
      Object.keys(update).length === 1 && update.pinned === false;
    updateMapPois(
      (display.mapPois ?? []).map((poi) =>
        poi.id === poiId && (!poi.pinned || unpinning)
          ? { ...poi, ...update, updatedAt: new Date().toISOString() }
          : poi,
      ),
    );
  };
  const deleteMapPoi = (poiId: string) => {
    if (!display) return;
    if (!isOwner) {
      requestMapPoiAction("delete", { poiId });
      return;
    }
    updateMapPois(
      (display.mapPois ?? []).filter((poi) => poi.id !== poiId || poi.pinned),
    );
  };
  const pasteMapPoi = (
    source: SessionMapPoi,
    position: { x: number; y: number },
    creatorProfileId = currentUserId,
  ) => {
    if (!display) return;
    if (!isOwner) {
      requestMapPoiAction("paste", { sourceId: source.id, position });
      return;
    }
    const persistedSource = (display.mapPois ?? []).find(
      (poi) => poi.id === source.id,
    );
    if (!persistedSource || persistedSource.pinned) return;
    const now = new Date().toISOString();
    updateMapPois([
      ...(display.mapPois ?? []),
      {
        ...persistedSource,
        id: crypto.randomUUID(),
        ...position,
        pinned: false,
        createdByProfileId: creatorProfileId,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  };
  const duplicateMapPoi = (poiId: string, creatorProfileId = currentUserId) => {
    const source = display?.mapPois?.find((poi) => poi.id === poiId);
    if (!source || source.pinned) return;
    if (!isOwner) {
      requestMapPoiAction("duplicate", { poiId });
      return;
    }
    pasteMapPoi(
      source,
      { x: source.x + 12, y: source.y + 12 },
      creatorProfileId,
    );
  };

  const addMapDrawing = (drawing: SessionMapDrawing) =>
    updateMapDrawings([
      ...(display?.mapDrawings ?? []),
      {
        ...drawing,
        createdByProfileId: drawing.createdByProfileId ?? currentUserId,
      },
    ]);
  const updateMapDrawing = (id: string, update: Partial<SessionMapDrawing>) => {
    const unpinning =
      Object.keys(update).length === 1 && update.pinned === false;
    updateMapDrawings(
      (display?.mapDrawings ?? []).map((item) =>
        item.id === id && (!item.pinned || unpinning)
          ? { ...item, ...update, updatedAt: new Date().toISOString() }
          : item,
      ),
    );
  };
  const updateMapDrawingsBatch = (
    ids: string[],
    update: Partial<SessionMapDrawing>,
  ) => {
    const selected = new Set(ids);
    const now = new Date().toISOString();
    updateMapDrawings(
      (display?.mapDrawings ?? []).map((item) =>
        selected.has(item.id) && !item.pinned
          ? { ...item, ...update, updatedAt: now }
          : item,
      ),
    );
  };
  const moveMapDrawings = (
    positions: Record<string, { x: number; y: number }>,
  ) => {
    const now = new Date().toISOString();
    updateMapDrawings(
      (display?.mapDrawings ?? []).map((item) =>
        positions[item.id] && !item.pinned
          ? { ...item, ...positions[item.id], updatedAt: now }
          : item,
      ),
    );
  };
  const updateMapDrawingTransforms = (
    updates: Record<string, Partial<SessionMapDrawing>>,
  ) => {
    const now = new Date().toISOString();
    updateMapDrawings(
      (display?.mapDrawings ?? []).map((item) =>
        updates[item.id] && !item.pinned
          ? { ...item, ...updates[item.id], updatedAt: now }
          : item,
      ),
    );
  };
  const deleteMapDrawing = (id: string) => {
    const remaining = (display?.mapDrawings ?? []).filter(
      (item) => item.id !== id || item.pinned,
    );
    const groups = new globalThis.Map<string, number>();
    remaining.forEach((item) => {
      if (item.magnetGroupId)
        groups.set(
          item.magnetGroupId,
          (groups.get(item.magnetGroupId) ?? 0) + 1,
        );
    });
    updateMapDrawings(
      remaining.map((item) =>
        item.magnetGroupId && (groups.get(item.magnetGroupId) ?? 0) < 2
          ? { ...item, magnetEnabled: false, magnetGroupId: null }
          : item,
      ),
    );
  };
  const duplicateMapDrawing = (id: string) => {
    const source = display?.mapDrawings?.find((item) => item.id === id);
    if (!source || source.pinned) return;
    const now = new Date().toISOString();
    updateMapDrawings([
      ...(display?.mapDrawings ?? []),
      {
        ...source,
        id: crypto.randomUUID(),
        x: source.x + 12,
        y: source.y + 12,
        points: source.points?.map((point) => ({ ...point })),
        style: { ...source.style },
        pinned: false,
        magnetEnabled: false,
        magnetGroupId: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  };
  const deleteMapDrawingsBatch = (ids: string[]) => {
    const selected = new Set(ids);
    updateMapDrawings(
      (display?.mapDrawings ?? []).filter(
        (item) => !selected.has(item.id) || item.pinned,
      ),
    );
  };
  const duplicateMapDrawingsBatch = (ids: string[]) => {
    const selected = new Set(ids);
    const now = new Date().toISOString();
    const copies = (display?.mapDrawings ?? [])
      .filter((item) => selected.has(item.id) && !item.pinned)
      .map((source) => ({
        ...source,
        id: crypto.randomUUID(),
        x: source.x + 12,
        y: source.y + 12,
        points: source.points?.map((point) => ({ ...point })),
        style: { ...source.style },
        pinned: false,
        magnetEnabled: false,
        magnetGroupId: null,
        createdAt: now,
        updatedAt: now,
      }));
    updateMapDrawings([...(display?.mapDrawings ?? []), ...copies]);
  };
  const moveMapDrawingLayer = (id: string, move: MapLayerMove) => moveMapObjectLayer([{ family: 'drawing', id }], move);
  const moveMapDrawingsLayer = (ids: string[], move: MapLayerMove) => moveMapObjectLayer(ids.map(id => ({ family: 'drawing', id })), move);
  const createMapDrawingMagnetGroup = (ids: string[]) => {
    const selected = new Set(ids);
    if (selected.size < 2) return;
    const groupId = crypto.randomUUID();
    updateMapDrawings(
      (display?.mapDrawings ?? []).map((item) =>
        selected.has(item.id)
          ? { ...item, magnetEnabled: true, magnetGroupId: groupId }
          : item,
      ),
    );
  };
  const disableMapDrawingMagnetGroup = (id: string) => {
    const source = display?.mapDrawings?.find((item) => item.id === id);
    if (!source) return;
    updateMapDrawings(
      (display?.mapDrawings ?? []).map((item) =>
        item.id === id ||
        (source.magnetGroupId && item.magnetGroupId === source.magnetGroupId)
          ? { ...item, magnetEnabled: false, magnetGroupId: null }
          : item,
      ),
    );
  };

  useEffect(() => {
    configureSessionMapDrawingClear(
      isOwner && display
        ? () =>
            updateMapDrawings(
              (display.mapDrawings ?? []).filter((item) => item.pinned),
            )
        : null,
    );
    return () => configureSessionMapDrawingClear(null);
  }, [display?.chapterId, display?.mapDrawings, isOwner]);

  const addMapToken = (
    visual: SessionMapTokenVisual,
    position: { x: number; y: number },
    size: number,
    creatorProfileId = currentUserId,
  ) => {
    if (!display) return;
    if (!isOwner) {
      requestMapTokenAction("create", { visual, position, size });
      return;
    }
    const now = new Date().toISOString();
    updateMapTokens([
      ...(display.mapTokens ?? []),
      {
        ...visual,
        ...position,
        id: crypto.randomUUID(),
        locked: false,
        pinned: false,
        visible: true,
        showLabel: false,
        labelColor: "var(--dash-surface)",
        size,
        rotation: 0,
        magnetEnabled: false,
        magnetGroupId: null,
        createdByProfileId: creatorProfileId,
        conditions: [],
        createdAt: now,
        updatedAt: now,
      },
    ]);
  };

  const moveMapTokens = (
    positions: Record<string, { x: number; y: number }>,
  ) => {
    if (!display) return;
    if (!isOwner) {
      requestMapTokenAction("move", { positions });
      return;
    }
    const now = new Date().toISOString();
    const tokens = (display.mapTokens ?? []).map((token) =>
      positions[token.id] && !token.pinned
        ? { ...token, ...positions[token.id], updatedAt: now }
        : token,
    );
    updateMapTokens(tokens);
  };

  const moveMapTokenLayer = (tokenId: string, move: MapLayerMove) => {
    if (!display) return;
    moveMapObjectLayer([{ family: 'token', id: tokenId }], move);
  };

  const moveMapTokensLayer = (tokenIds: string[], move: MapLayerMove) => {
    if (!display || tokenIds.length === 0) return;
    moveMapObjectLayer(tokenIds.map(id => ({ family: 'token', id })), move);
  };

  const setMapTokenLocked = (tokenId: string, locked: boolean) => {
    if (!isOwner || !display) return;
    const tokens = display.mapTokens ?? [];
    const target = tokens.find((token) => token.id === tokenId);
    const now = new Date().toISOString();
    updateMapTokens(
      tokens.map((token) =>
        token.id === tokenId ||
        (target?.magnetGroupId && token.magnetGroupId === target.magnetGroupId)
          ? { ...token, locked, updatedAt: now }
          : token,
      ),
    );
  };

  const updateMapToken = (
    tokenId: string,
    update: Partial<SessionMapToken>,
  ) => {
    if (!display) return;
    if (!isOwner) {
      requestMapTokenAction("update", { tokenIds: [tokenId], update });
      return;
    }
    const tokens = display.mapTokens ?? [];
    const target = tokens.find((token) => token.id === tokenId);
    const sharedUpdate = Object.fromEntries(
      Object.entries(update).filter(([key]) =>
        ["visible", "showLabel", "labelColor"].includes(key),
      ),
    );
    const now = new Date().toISOString();
    updateMapTokens(
      tokens.map((token) => {
        if (token.id === tokenId)
          return !token.pinned ||
            (Object.keys(update).length === 1 && update.pinned === false)
            ? { ...token, ...update, updatedAt: now }
            : token;
        if (
          target?.magnetGroupId &&
          token.magnetGroupId === target.magnetGroupId &&
          Object.keys(sharedUpdate).length > 0
        )
          return { ...token, ...sharedUpdate, updatedAt: now };
        return token;
      }),
    );
  };

  const updateMapTokensBatch = (
    tokenIds: string[],
    update: Partial<SessionMapToken>,
  ) => {
    if (!display) return;
    if (!isOwner) {
      requestMapTokenAction("update", { tokenIds, update });
      return;
    }
    const ids = new Set(tokenIds);
    const now = new Date().toISOString();
    updateMapTokens(
      (display.mapTokens ?? []).map((token) =>
        ids.has(token.id) && !token.pinned
          ? { ...token, ...update, updatedAt: now }
          : token,
      ),
    );
  };

  const updateMapTokenTransforms = (
    updates: Record<string, Partial<SessionMapToken>>,
  ) => {
    if (!display) return;
    if (!isOwner) {
      requestMapTokenAction("transform", { updates });
      return;
    }
    const now = new Date().toISOString();
    updateMapTokens(
      (display.mapTokens ?? []).map((token) =>
        updates[token.id] && !token.pinned
          ? { ...token, ...updates[token.id], updatedAt: now }
          : token,
      ),
    );
  };

  const setMapTokenMagnetEnabled = (tokenId: string, enabled: boolean) => {
    if (!display) return;
    if (!isOwner) {
      requestMapTokenAction("magnet-enabled", { tokenId, enabled });
      return;
    }
    const tokens = display.mapTokens ?? [];
    const target = tokens.find((token) => token.id === tokenId);
    if (!target) return;
    const next = tokens.map((token) =>
      token.id === tokenId
        ? {
            ...token,
            magnetEnabled: enabled,
            magnetGroupId: enabled ? token.magnetGroupId : null,
          }
        : token,
    );
    const remainingGroup = target.magnetGroupId
      ? next.filter((token) => token.magnetGroupId === target.magnetGroupId)
      : [];
    updateMapTokens(
      remainingGroup.length === 1
        ? next.map((token) =>
            token.id === remainingGroup[0].id
              ? { ...token, magnetGroupId: null }
              : token,
          )
        : next,
    );
  };

  const linkMapTokens = (tokenId: string, otherTokenId: string) => {
    if (!display || tokenId === otherTokenId) return;
    if (!isOwner) {
      requestMapTokenAction("magnet-link", { tokenId, otherTokenId });
      return;
    }
    const tokens = display.mapTokens ?? [];
    const token = tokens.find((candidate) => candidate.id === tokenId);
    const other = tokens.find((candidate) => candidate.id === otherTokenId);
    if (!token || !other || !token.magnetEnabled || !other.magnetEnabled)
      return;
    const groupId =
      token.magnetGroupId ?? other.magnetGroupId ?? crypto.randomUUID();
    const mergedGroupIds = new Set(
      [token.magnetGroupId, other.magnetGroupId].filter(Boolean),
    );
    updateMapTokens(
      tokens.map((candidate) =>
        candidate.id === tokenId ||
        candidate.id === otherTokenId ||
        (candidate.magnetGroupId && mergedGroupIds.has(candidate.magnetGroupId))
          ? { ...candidate, magnetGroupId: groupId }
          : candidate,
      ),
    );
  };

  const unlinkMapToken = (tokenId: string) => {
    if (!display) return;
    if (!isOwner) {
      requestMapTokenAction("magnet-unlink", { tokenId });
      return;
    }
    const tokens = display.mapTokens ?? [];
    const target = tokens.find((token) => token.id === tokenId);
    if (!target?.magnetGroupId) return;
    const next = tokens.map((token) =>
      token.id === tokenId ? { ...token, magnetGroupId: null } : token,
    );
    const remaining = next.filter(
      (token) => token.magnetGroupId === target.magnetGroupId,
    );
    updateMapTokens(
      remaining.length === 1
        ? next.map((token) =>
            token.id === remaining[0].id
              ? { ...token, magnetGroupId: null }
              : token,
          )
        : next,
    );
  };

  const deleteMapToken = (tokenId: string) => {
    if (!display) return;
    if (!isOwner) {
      requestMapTokenAction("delete", { tokenIds: [tokenId] });
      return;
    }
    const tokens = display.mapTokens ?? [];
    const deleted = tokens.find(
      (token) => token.id === tokenId && !token.pinned,
    );
    if (!deleted) return;
    const next = tokens.filter((token) => token.id !== tokenId || token.pinned);
    const remaining = deleted?.magnetGroupId
      ? next.filter((token) => token.magnetGroupId === deleted.magnetGroupId)
      : [];
    updateMapTokens(
      remaining.length === 1
        ? next.map((token) =>
            token.id === remaining[0].id
              ? { ...token, magnetGroupId: null }
              : token,
          )
        : next,
    );
  };

  const deleteMapTokensBatch = (tokenIds: string[]) => {
    if (!display) return;
    if (!isOwner) {
      requestMapTokenAction("delete", { tokenIds });
      return;
    }
    const ids = new Set(tokenIds);
    const next = (display.mapTokens ?? []).filter(
      (token) => !ids.has(token.id) || token.pinned,
    );
    const groupCounts = new globalThis.Map<string, number>();
    next.forEach((token) => {
      if (token.magnetGroupId)
        groupCounts.set(
          token.magnetGroupId,
          (groupCounts.get(token.magnetGroupId) ?? 0) + 1,
        );
    });
    updateMapTokens(
      next.map((token) =>
        token.magnetGroupId && groupCounts.get(token.magnetGroupId) === 1
          ? { ...token, magnetGroupId: null }
          : token,
      ),
    );
  };

  const createMapTokenMagnetGroup = (tokenIds: string[]) => {
    if (!display || tokenIds.length < 2) return;
    if (!isOwner) {
      requestMapTokenAction("magnet-group", { tokenIds });
      return;
    }
    const ids = new Set(tokenIds);
    const groupId = crypto.randomUUID();
    updateMapTokens(
      (display.mapTokens ?? []).map((token) =>
        ids.has(token.id)
          ? { ...token, magnetEnabled: true, magnetGroupId: groupId }
          : token,
      ),
    );
  };

  playerMapActionHandlerRef.current = (payload: any) => {
    if (
      !isOwner ||
      !display ||
      !payload ||
      payload.chapterId !== display.chapterId
    )
      return;
    const tokens = display.mapTokens ?? [];
    const unlockedIds = new Set(
      tokens
        .filter((token) => !token.locked && !token.pinned)
        .map((token) => token.id),
    );
    const controlledIds = new Set(
      tokens
        .filter(
          (token) =>
            !token.locked &&
            !token.pinned &&
            token.createdByProfileId === payload.actorProfileId,
        )
        .map((token) => token.id),
    );
    const requestedIds = Array.isArray(payload.tokenIds)
      ? payload.tokenIds.filter(
          (id: unknown): id is string =>
            typeof id === "string" && unlockedIds.has(id),
        )
      : [];
    const controlledRequestedIds = requestedIds.filter((id) =>
      controlledIds.has(id),
    );
    if (
      payload.action === "create" &&
      typeof payload.actorProfileId === "string" &&
      payload.visual &&
      payload.position &&
      Number.isFinite(payload.position.x) &&
      Number.isFinite(payload.position.y) &&
      Number.isFinite(payload.size)
    ) {
      addMapToken(
        payload.visual,
        payload.position,
        payload.size,
        payload.actorProfileId,
      );
    } else if (
      payload.action === "move" &&
      payload.positions &&
      typeof payload.positions === "object"
    ) {
      const positions = Object.fromEntries(
        Object.entries(payload.positions).filter(
          ([id, position]: [string, any]) =>
            unlockedIds.has(id) &&
            Number.isFinite(position?.x) &&
            Number.isFinite(position?.y),
        ),
      ) as Record<string, { x: number; y: number }>;
      moveMapTokens(positions);
    } else if (
      payload.action === "layer" &&
      controlledRequestedIds.length > 0 &&
      ["forward", "backward", "front", "back"].includes(payload.move)
    ) {
      if (controlledRequestedIds.length === 1)
        moveMapTokenLayer(controlledRequestedIds[0], payload.move);
      else moveMapTokensLayer(controlledRequestedIds, payload.move);
    } else if (
      payload.action === "update" &&
      controlledRequestedIds.length > 0 &&
      payload.update &&
      typeof payload.update === "object"
    ) {
      const allowed = Object.fromEntries(
        Object.entries(payload.update).filter(([key]) =>
          ["name", "showLabel", "labelColor", "conditions"].includes(key),
        ),
      );
      if (Object.keys(allowed).length > 0)
        updateMapTokensBatch(controlledRequestedIds, allowed);
    } else if (
      payload.action === "transform" &&
      payload.updates &&
      typeof payload.updates === "object"
    ) {
      const updates = Object.fromEntries(
        Object.entries(payload.updates).filter(
          ([id, update]: [string, any]) =>
            controlledIds.has(id) &&
            update &&
            Number.isFinite(update.x) &&
            Number.isFinite(update.y) &&
            Number.isFinite(update.size) &&
            Number.isFinite(update.rotation),
        ),
      );
      updateMapTokenTransforms(updates);
    } else if (payload.action === "delete" && controlledRequestedIds.length > 0)
      deleteMapTokensBatch(controlledRequestedIds);
    else if (
      payload.action === "magnet-enabled" &&
      typeof payload.tokenId === "string" &&
      controlledIds.has(payload.tokenId)
    )
      setMapTokenMagnetEnabled(payload.tokenId, !!payload.enabled);
    else if (
      payload.action === "magnet-link" &&
      typeof payload.tokenId === "string" &&
      typeof payload.otherTokenId === "string" &&
      controlledIds.has(payload.tokenId) &&
      controlledIds.has(payload.otherTokenId)
    )
      linkMapTokens(payload.tokenId, payload.otherTokenId);
    else if (
      payload.action === "magnet-unlink" &&
      typeof payload.tokenId === "string" &&
      controlledIds.has(payload.tokenId)
    )
      unlinkMapToken(payload.tokenId);
    else if (
      payload.action === "magnet-group" &&
      controlledRequestedIds.length > 1
    )
      createMapTokenMagnetGroup(controlledRequestedIds);
  };
  playerMapLayerActionHandlerRef.current = (payload: any) => {
    if (!isOwner || !display || !payload || payload.chapterId !== display.chapterId || typeof payload.actorProfileId !== 'string' || payload.actorProfileId === currentUserId) return;
    if (!Array.isArray(payload.refs) || !['forward', 'backward', 'front', 'back'].includes(payload.move)) return;
    const refs = payload.refs.filter((ref: unknown): ref is MapObjectRef => {
      if (!ref || typeof ref !== 'object') return false;
      const candidate = ref as Record<string, unknown>;
      return ['drawing', 'token', 'poi'].includes(String(candidate.family)) && typeof candidate.id === 'string';
    });
    if (refs.length !== payload.refs.length) return;
    moveMapObjectLayer(refs, payload.move, payload.actorProfileId);
  };
  playerMapPoiActionHandlerRef.current = (payload: any) => {
    if (
      !isOwner ||
      !display ||
      !payload ||
      payload.chapterId !== display.chapterId ||
      typeof payload.actorProfileId !== "string"
    )
      return;
    const pois = display.mapPois ?? [];
    const controlled = (id: unknown) =>
      typeof id === "string" &&
      pois.some(
        (poi) =>
          poi.id === id &&
          poi.createdByProfileId === payload.actorProfileId &&
          !poi.locked &&
          !poi.pinned,
      );
    if (
      payload.action === "create" &&
      Number.isFinite(payload.position?.x) &&
      Number.isFinite(payload.position?.y)
    )
      addMapPoi(payload.position, payload.actorProfileId);
    else if (
      payload.action === "move" &&
      controlled(payload.poiId) &&
      Number.isFinite(payload.position?.x) &&
      Number.isFinite(payload.position?.y)
    )
      moveMapPoi(payload.poiId, payload.position);
    else if (
      payload.action === "update" &&
      controlled(payload.poiId) &&
      payload.update &&
      typeof payload.update === "object"
    ) {
      const allowed = Object.fromEntries(
        Object.entries(payload.update).filter(
          ([key, value]) =>
            [
              "iconName",
              "color",
              "size",
              "rotation",
              "label",
              "labelVisible",
              "noteId",
              "noteVisibleToPlayers",
            ].includes(key) &&
            (typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean" ||
              value === null),
        ),
      );
      if (Object.keys(allowed).length) changeMapPoi(payload.poiId, allowed);
    } else if (payload.action === "duplicate" && controlled(payload.poiId))
      duplicateMapPoi(payload.poiId, payload.actorProfileId);
    else if (
      payload.action === "paste" &&
      controlled(payload.sourceId) &&
      Number.isFinite(payload.position?.x) &&
      Number.isFinite(payload.position?.y)
    ) {
      const source = pois.find((poi) => poi.id === payload.sourceId);
      if (source) pasteMapPoi(source, payload.position, payload.actorProfileId);
    } else if (payload.action === "delete" && controlled(payload.poiId))
      deleteMapPoi(payload.poiId);
  };

  useEffect(() => {
    if (!isOwner || !display?.mapTokens?.some((token) => token.size == null))
      return;
    const size =
      display.gridSettings?.cellSize ?? DEFAULT_SESSION_GRID.cellSize;
    updateMapTokens(
      display.mapTokens.map((token) =>
        token.size == null ? { ...token, size } : token,
      ),
      false,
    );
  }, [
    display?.chapterId,
    display?.gridSettings?.cellSize,
    display?.mapTokens,
    isOwner,
  ]);

  useEffect(() => {
    if (!isOwner || !display) return;
    const reconciled = reconcileOrder(display.mapObjectOrder, display.mapDrawings ?? [], display.mapTokens ?? [], display.mapPois ?? []);
    if (JSON.stringify(chapterObjectOrders[display.chapterId]) === JSON.stringify(reconciled)) return;
    setChapterObjectOrders((orders) => ({ ...orders, [display.chapterId]: reconciled }));
  }, [display?.chapterId, display?.mapDrawings, display?.mapTokens, display?.mapPois, display?.mapObjectOrder, isOwner]);

  useEffect(() => {
    const settings = display?.gridSettings ?? DEFAULT_SESSION_GRID;
    const normalizedSettings = {
      ...settings,
      visible: true,
      opacity: settings.visible === false ? 0 : settings.opacity,
      unit:
        settings.unit.trim().toLowerCase() === "ft" ? "Metri" : settings.unit,
      lineStyle: settings.lineStyle ?? "solid",
      squareSnapMode: settings.squareSnapMode ?? "half-step",
    };
    configureSessionGrid(
      normalizedSettings,
      isOwner && Boolean(display),
      isOwner ? updateGridSettings : null,
    );
    if (
      isOwner &&
      display &&
      (settings.visible === false ||
        settings.unit !== normalizedSettings.unit ||
        !settings.lineStyle ||
        !settings.squareSnapMode)
    )
      updateGridSettings(normalizedSettings, false);
    return () => configureSessionGrid(DEFAULT_SESSION_GRID, false, null);
  }, [
    display?.chapterId,
    display?.gridSettings,
    display?.id,
    display?.mapPlacement,
    isOwner,
  ]);

  const endSession = async () => {
    setEnding(true);
    try {
      await onEndSession();
    } finally {
      setEnding(false);
    }
  };

  const encounterMatchesScene = (scene: Scene) =>
    activeEncounter?.sceneId === scene.id ||
    (!activeEncounter?.sceneId &&
      activeEncounter?.environmentId === (scene.environmentId ?? scene.id));

  const startEncounter = async (scene: Scene, chapter: Chapter) => {
    setEncounterBusyId(scene.id);
    try {
      if (activeScene?.sceneId !== scene.id) await chooseScene(scene, chapter);
      else {
        setSelectedChapterId(chapter.id);
        setSelectedSceneId(scene.id);
      }
      setActiveEncounter(await buildSceneEncounter(campaignId, scene));
    } catch (error) {
      console.error("Avvio incontro dalla sessione non riuscito:", error);
    } finally {
      setEncounterBusyId(null);
    }
  };

  const toggleEncounterPause = (scene: Scene) => {
    if (!activeEncounter || !encounterMatchesScene(scene)) return;
    const paused = activeEncounter.status === "paused";
    setActiveEncounter({
      ...activeEncounter,
      status: paused ? "running" : "paused",
      pausedAt: paused ? undefined : new Date().toISOString(),
    });
  };

  const stopEncounter = (scene: Scene) => {
    if (encounterMatchesScene(scene)) setActiveEncounter(null);
  };

  const beginTreeResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    treeResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: treeWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizingTree(true);
  };

  const moveTreeResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = treeResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    setTreeWidth(
      Math.min(
        TREE_MAX_WIDTH,
        Math.max(
          TREE_MIN_WIDTH,
          resize.startWidth + event.clientX - resize.startX,
        ),
      ),
    );
  };

  const finishTreeResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (treeResizeRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    treeResizeRef.current = null;
    setResizingTree(false);
  };

  return (
    <div
      className={`grid h-full min-h-0 grid-cols-1 overflow-hidden bg-[#111318] ${isOwner && !treeHidden ? "grid-rows-[minmax(220px,38vh)_minmax(0,1fr)] md:grid-cols-[var(--session-tree-width)_minmax(0,1fr)] md:grid-rows-1" : "grid-rows-1"}`}
      style={{ "--session-tree-width": `${treeWidth}px` } as CSSProperties}
    >
      {isOwner && !treeHidden && (
        <aside className="relative flex min-h-0 flex-col border-b border-white/10 bg-[#1a1d25] md:border-b-0 md:border-r">
          <div className="border-b border-white/10 px-4 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
              Sessione live
            </div>
            <div className="mt-2 flex min-w-0 items-center gap-3">
              {campaignLogoUrl ? (
                <img
                  src={campaignLogoUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-white/15"
                />
              ) : (
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-cyan-400/10 p-1 ring-1 ring-cyan-300/20">
                  <img
                    src="/icon-source-1024.png"
                    alt=""
                    className="h-full w-full object-contain opacity-90"
                    style={{ filter: "invert(1)" }}
                  />
                </div>
              )}
              <h2 className="min-w-0 truncate text-base font-semibold text-white">
                {campaignName}
              </h2>
              <button
                type="button"
                onClick={() => setTreeHidden(true)}
                aria-label="Nascondi pannello Capitoli e Scene"
                title="Nascondi pannello"
                className="ml-auto rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            {isOwner && (
              <button
                type="button"
                disabled={ending}
                onClick={() => void endSession()}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-700/70 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-900/50 disabled:opacity-50"
              >
                {ending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                Termina sessione
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-3 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
              <Map className="h-4 w-4" />
              Capitoli e Scene
            </div>
            {loading ? (
              <div className="flex items-center gap-2 px-2 py-4 text-sm text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" />
                Caricamento...
              </div>
            ) : (
              <div className="space-y-2">
                {orderedChapters.map((chapter) => {
                  const chapterScenes = scenes
                    .filter((scene) => scene.chapterId === chapter.id)
                    .sort(
                      (a, b) =>
                        a.sortOrder - b.sortOrder ||
                        a.title.localeCompare(b.title, "it"),
                    );
                  const isCollapsed = collapsed.has(chapter.id);
                  return (
                    <div key={chapter.id} className="relative">
                      <div
                        className={`flex items-center rounded-lg border ${selectedChapterId === chapter.id ? "border-cyan-400/70 bg-cyan-400/10" : "border-white/10 bg-white/[0.03]"}`}
                      >
                        <button
                          type="button"
                          aria-label={
                            isCollapsed
                              ? "Espandi Capitolo"
                              : "Comprimi Capitolo"
                          }
                          onClick={() =>
                            setCollapsed((current) => {
                              const next = new Set(current);
                              if (next.has(chapter.id)) next.delete(chapter.id);
                              else next.add(chapter.id);
                              return next;
                            })
                          }
                          className="p-2 text-white/50"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedChapterId(chapter.id);
                            setSelectedSceneId(null);
                          }}
                          className="min-w-0 flex-1 py-2 pr-2 text-left"
                        >
                          <span className="block truncate text-sm font-medium text-white">
                            {chapter.title}
                          </span>
                          {chapter.isActive && (
                            <span className="text-[10px] uppercase tracking-wider text-cyan-300">
                              Capitolo corrente
                            </span>
                          )}
                        </button>
                      </div>
                      {!isCollapsed && (
                        <div className="ml-5 border-l border-white/15 pl-3 pt-1.5">
                          {chapterScenes.length === 0 ? (
                            <div className="py-2 text-xs text-white/35">
                              Nessuna scena
                            </div>
                          ) : (
                            chapterScenes.map((scene) => {
                              const encounterActive =
                                encounterMatchesScene(scene);
                              const encounterPaused =
                                encounterActive &&
                                activeEncounter?.status === "paused";
                              return (
                                <div
                                  key={scene.id}
                                  className={`relative mb-1 flex w-full items-center rounded-md border text-xs ${selectedSceneId === scene.id ? "border-cyan-400/60 bg-cyan-400/10 text-white" : "border-transparent text-white/65 hover:bg-white/[0.05] hover:text-white"}`}
                                >
                                  <span className="absolute -left-[13px] top-1/2 h-px w-3 bg-white/15" />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void chooseScene(scene, chapter)
                                    }
                                    className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
                                  >
                                    <span
                                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${scene.status === "ready" ? "bg-emerald-400" : scene.status === "completed" ? "bg-white/30" : "bg-amber-400"}`}
                                    />
                                    <span className="min-w-0 flex-1 truncate">
                                      {scene.title}
                                    </span>
                                    {publishingId === scene.id && (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    )}
                                  </button>
                                  <div className="flex shrink-0 items-center gap-0.5 pr-1">
                                    {!encounterActive && (
                                      <button
                                        type="button"
                                        disabled={encounterBusyId === scene.id}
                                        onClick={() =>
                                          void startEncounter(scene, chapter)
                                        }
                                        aria-label={`Avvia incontro ${scene.title}`}
                                        title="Avvia incontro"
                                        className="rounded p-1.5 text-emerald-300 hover:bg-emerald-400/15 disabled:opacity-40"
                                      >
                                        {encounterBusyId === scene.id ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <Play className="h-3.5 w-3.5" />
                                        )}
                                      </button>
                                    )}
                                    {encounterActive && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          toggleEncounterPause(scene)
                                        }
                                        aria-label={`${encounterPaused ? "Riprendi" : "Metti in pausa"} incontro ${scene.title}`}
                                        title={
                                          encounterPaused
                                            ? "Riprendi incontro"
                                            : "Pausa incontro"
                                        }
                                        className={`rounded p-1.5 text-amber-300 hover:bg-amber-400/15 ${encounterPaused ? "animate-pulse bg-amber-400/15" : ""}`}
                                      >
                                        <Pause className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    {encounterActive && (
                                      <button
                                        type="button"
                                        onClick={() => stopEncounter(scene)}
                                        aria-label={`Termina incontro ${scene.title}`}
                                        title="Termina incontro"
                                        className="rounded p-1.5 text-red-300 hover:bg-red-400/15"
                                      >
                                        <Square className="h-3.5 w-3.5 fill-current" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {display && (
            <div className="border-t border-white/10 p-3">
              <div className="mb-2 truncate text-xs font-medium text-white/70">
                {display.chapterTitle}
              </div>
              <button
                type="button"
                data-map-lock={mapPlacement.locked ? "locked" : "unlocked"}
                aria-label={
                  mapPlacement.locked ? "Sblocca mappa" : "Blocca mappa"
                }
                onClick={() =>
                  updateMapPlacement({
                    ...mapPlacement,
                    locked: !mapPlacement.locked,
                  })
                }
                className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${mapPlacement.locked ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-white/15 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]"}`}
              >
                {mapPlacement.locked ? (
                  <Lock className="h-4 w-4" />
                ) : (
                  <Unlock className="h-4 w-4" />
                )}
                {mapPlacement.locked ? "Mappa bloccata" : "Mappa sbloccata"}
              </button>
            </div>
          )}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Ridimensiona albero Capitoli e Scene"
            aria-valuemin={TREE_MIN_WIDTH}
            aria-valuemax={TREE_MAX_WIDTH}
            aria-valuenow={Math.round(treeWidth)}
            onPointerDown={beginTreeResize}
            onPointerMove={moveTreeResize}
            onPointerUp={finishTreeResize}
            onPointerCancel={finishTreeResize}
            onLostPointerCapture={() => {
              treeResizeRef.current = null;
              setResizingTree(false);
            }}
            className="group absolute inset-y-0 -right-1 z-30 hidden w-2 cursor-col-resize touch-none md:block"
          >
            <div
              className={`pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${resizingTree ? "bg-cyan-300" : "bg-transparent group-hover:bg-cyan-300/80"}`}
            />
          </div>
        </aside>
      )}

      <main className="relative min-h-0 overflow-hidden bg-[radial-gradient(circle_at_center,#262a31_0%,#14161b_58%,#0d0f13_100%)]">
        {isOwner && treeHidden && (
          <button
            type="button"
            onClick={() => setTreeHidden(false)}
            aria-label="Mostra pannello Capitoli e Scene"
            title="Mostra pannello"
            className="absolute left-3 top-3 z-40 rounded-lg border border-white/15 bg-black/60 p-2 text-white/70 shadow-lg backdrop-blur hover:text-white"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
        {display ? (
          display.mapUrl || display.sceneImageUrl ? (
            <MapViewport
              key={`${display.campaignId}:${display.chapterId}`}
              campaignId={campaignId}
              currentUserId={currentUserId}
              currentUserAccessToken={currentUserAccessToken}
              mapId={`${display.campaignId}:${display.chapterId}`}
              backgroundUrl={
                display.mapMetadata.previewUrl ??
                display.mapUrl ??
                display.sceneImageUrl
              }
              isOwner={isOwner}
              mapPlacement={mapPlacement}
              gridSettings={display.gridSettings ?? DEFAULT_SESSION_GRID}
              mapTokens={(display.mapTokens ?? []).filter(
                (token) => isOwner || !token.hiddenFromPlayers,
              )}
              mapDrawings={display.mapDrawings ?? []}
              mapFog={display.mapFog ?? []}
               mapPois={(display.mapPois ?? []).filter(
                (poi) => isOwner || poi.visibleToPlayers,
               )}
              mapObjectOrder={display.mapObjectOrder}
              onPoiCreate={addMapPoi}
              onPoiMove={moveMapPoi}
              onPoiChange={changeMapPoi}
              onPoiDelete={deleteMapPoi}
              onPoiDuplicate={duplicateMapPoi}
              onPoiPaste={pasteMapPoi}
              onPoiLayerMove={(id, move) => moveMapObjectLayer([{ family: 'poi', id }], move)}
              onDrawingCreate={addMapDrawing}
              onDrawingChange={updateMapDrawing}
              onDrawingsChange={updateMapDrawingsBatch}
              onDrawingsMove={moveMapDrawings}
              onDrawingTransformsChange={updateMapDrawingTransforms}
              onDrawingDelete={deleteMapDrawing}
              onDrawingsDelete={deleteMapDrawingsBatch}
              onDrawingDuplicate={duplicateMapDrawing}
              onDrawingsDuplicate={duplicateMapDrawingsBatch}
              onDrawingLayerMove={moveMapDrawingLayer}
              onDrawingsLayerMove={moveMapDrawingsLayer}
              onDrawingsCreateMagnetGroup={createMapDrawingMagnetGroup}
              onDrawingMagnetDisable={disableMapDrawingMagnetGroup}
              onFogCreate={addMapFog}
              onFogChange={changeMapFog}
              onFogsChange={changeMapFogBatch}
              onFogsMove={transformMapFog}
              onFogTransformsChange={transformMapFog}
              onFogDelete={deleteMapFog}
              onFogsDelete={deleteMapFogBatch}
              onFogCoverFullMap={addMapFog}
              onMapPlacementChange={updateMapPlacement}
              onTokenDrop={addMapToken}
              onTokensMove={moveMapTokens}
              onTokenLayerMove={moveMapTokenLayer}
              onTokensLayerMove={moveMapTokensLayer}
              onTokenLockChange={setMapTokenLocked}
              onTokenChange={updateMapToken}
              onTokensChange={updateMapTokensBatch}
              onTokenTransformsChange={updateMapTokenTransforms}
              onTokenDelete={deleteMapToken}
              onTokensDelete={deleteMapTokensBatch}
              onTokensCreateMagnetGroup={createMapTokenMagnetGroup}
              onTokenMagnetEnabledChange={setMapTokenMagnetEnabled}
              onTokenMagnetLink={linkMapTokens}
              onTokenMagnetUnlink={unlinkMapToken}
            >
              <ActiveSceneMap
                scene={display}
                unframed
                fill={Boolean(mapPlacement.width && mapPlacement.height)}
              />
            </MapViewport>
          ) : (
            <div className="grid h-full min-h-[55vh] place-items-center px-8 text-center">
              <div>
                <Map className="mx-auto h-12 w-12 text-white/20" />
                <p className="mt-3 text-sm text-white/45">
                  Nessuna mappa assegnata a questo Capitolo.
                </p>
              </div>
            </div>
          )
        ) : (
          <div className="grid h-full min-h-[60vh] place-items-center text-center">
            <div>
              <Map className="mx-auto h-14 w-14 text-white/15" />
              <h1 className="mt-4 text-xl font-semibold text-white/70">
                In attesa della mappa
              </h1>
              <p className="mt-2 text-sm text-white/40">
                Il Game Master selezionerà il Capitolo da giocare.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
