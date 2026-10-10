import type { Chapter } from '../../types/chapter';
import type { ChapterMapMetadata, SceneContextMetadata, SceneMapRegion } from '../../types/mapGeometry';
import type { Scene } from '../../types/scene';

type JsonRow = Record<string, any>;

const DEFAULT_MAP: ChapterMapMetadata = { imageUrl: null, gridVisible: true, gridColumns: 20, gridRows: 20 };
const DEFAULT_CONTEXT: SceneContextMetadata = { timeOfDay: '', period: '', condition: '' };

export function normalizeChapterSpatialValue(chapter: Partial<Chapter> & Pick<Chapter, 'id' | 'campaignId' | 'title'>): Chapter {
  const metadata = chapter.mapMetadata && typeof chapter.mapMetadata === 'object' ? chapter.mapMetadata : DEFAULT_MAP;
  const now = new Date().toISOString();
  return {
    description: '', notes: '', kind: 'standard', isActive: false,
    createdAt: now, updatedAt: now,
    ...chapter,
    mapUrl: chapter.mapUrl ?? metadata.imageUrl ?? null,
    mapMetadata: {
      imageUrl: metadata.imageUrl ?? chapter.mapUrl ?? null,
      gridVisible: metadata.gridVisible ?? true,
      gridColumns: Math.max(1, Number(metadata.gridColumns) || 20),
      gridRows: Math.max(1, Number(metadata.gridRows) || 20),
    },
    locationMetadata: chapter.locationMetadata && typeof chapter.locationMetadata === 'object' ? chapter.locationMetadata : {},
    nextChapterIds: Array.isArray(chapter.nextChapterIds) ? chapter.nextChapterIds : [],
  };
}

export function normalizeSceneSpatialValue(scene: Partial<Scene> & Pick<Scene, 'id' | 'campaignId' | 'chapterId' | 'title'>): Scene {
  const context = scene.contextMetadata && typeof scene.contextMetadata === 'object' ? scene.contextMetadata : DEFAULT_CONTEXT;
  const now = new Date().toISOString();
  return {
    description: '', notes: '', status: 'draft', imageUrl: null, sortOrder: 0,
    createdAt: now, updatedAt: now,
    ...scene,
    mapRegions: Array.isArray(scene.mapRegions) ? scene.mapRegions.filter(isSceneMapRegion) : [],
    contextMetadata: {
      timeOfDay: context.timeOfDay ?? '',
      period: context.period ?? '',
      condition: context.condition ?? '',
    },
    nextSceneIds: Array.isArray(scene.nextSceneIds) ? scene.nextSceneIds : [],
  };
}

function isSceneMapRegion(value: unknown): value is SceneMapRegion {
  if (!value || typeof value !== 'object') return false;
  const region = value as SceneMapRegion;
  if (!region.id || !region.geometry) return false;
  if (region.geometry.kind === 'rect') {
    const { x, y, width, height } = region.geometry.rect ?? {} as any;
    return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0;
  }
  return region.geometry.kind === 'polygon' && Array.isArray(region.geometry.points) && region.geometry.points.length >= 3
    && region.geometry.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y));
}

/** Converts persisted local Environment rows without removing the compatibility source. */
export function migrateEnvironmentDomainTables(tables: Record<string, JsonRow[]>): Record<string, JsonRow[]> {
  const environments = Array.isArray(tables.environments) ? tables.environments : [];
  if (!environments.length) return tables;
  const chapters = Array.isArray(tables.chapters) ? tables.chapters : (tables.chapters = []);
  const scenes = Array.isArray(tables.scenes) ? tables.scenes : (tables.scenes = []);
  const snake = environments.some(row => 'campaign_id' in row || 'parent_location_id' in row);
  const key = (camel: string, sql: string) => snake ? sql : camel;
  const parentKey = key('parentLocationId', 'parent_location_id');
  const campaignKey = key('campaignId', 'campaign_id');
  const sourceKey = key('sourceEnvironment', 'source_environment');
  const chapterKey = key('chapterId', 'chapter_id');
  const sceneKey = key('sceneId', 'scene_id');
  const byId = new Map(environments.map(row => [String(row.id), row]));
  const existingChapterSource = new Map(chapters.filter(row => row[sourceKey]?.id).map(row => [String(row[sourceKey].id), row]));
  const existingSceneSource = new Map(scenes.filter(row => row[sourceKey]?.id).map(row => [String(row[sourceKey].id), row]));
  const usedChapterIds = new Set(chapters.map(row => String(row.id)));
  const usedSceneIds = new Set(scenes.map(row => String(row.id)));
  const chapterByRoot = new Map<string, string>();
  const sceneByEnvironment = new Map<string, string>();

  const roots = environments.filter(row => !row[parentKey] || !byId.has(String(row[parentKey])));
  for (const environment of roots) {
    const sourceId = String(environment.id);
    const existing = existingChapterSource.get(sourceId);
    const id = existing?.id ?? (usedChapterIds.has(sourceId) ? crypto.randomUUID() : sourceId);
    chapterByRoot.set(sourceId, String(id)); usedChapterIds.add(String(id));
    if (!existing) chapters.push(snake ? {
      id, [campaignKey]: environment[campaignKey], title: environment.name, description: environment.description ?? '', notes: environment.notes ?? '', kind: 'standard', is_active: false, next_chapter_ids: [], map_url: environment.map_url ?? null,
      map_metadata: { imageUrl: environment.map_url ?? null, gridVisible: true, gridColumns: 20, gridRows: 20 }, location_metadata: environment, [sourceKey]: environment,
      created_at: environment.created_at ?? new Date().toISOString(), updated_at: environment.updated_at ?? new Date().toISOString(),
    } : normalizeChapterSpatialValue({ id, campaignId: environment.campaignId, title: environment.name, description: environment.description ?? '', notes: environment.notes ?? '', mapUrl: environment.mapUrl ?? null, mapMetadata: { ...DEFAULT_MAP, imageUrl: environment.mapUrl ?? null }, locationMetadata: environment, sourceEnvironment: environment, createdAt: environment.createdAt, updatedAt: environment.updatedAt }));
  }

  const rootOf = (environment: JsonRow): string | null => {
    let current = environment, guard = new Set<string>();
    while (current[parentKey] && byId.has(String(current[parentKey]))) {
      if (guard.has(String(current.id))) return null;
      guard.add(String(current.id)); current = byId.get(String(current[parentKey]))!;
    }
    return String(current.id);
  };
  for (const environment of environments.filter(row => row[parentKey] && byId.has(String(row[parentKey])))) {
    const sourceId = String(environment.id), rootId = rootOf(environment), chapterId = rootId ? chapterByRoot.get(rootId) : null;
    if (!chapterId) continue;
    const existing = existingSceneSource.get(sourceId);
    const id = existing?.id ?? (usedSceneIds.has(sourceId) ? crypto.randomUUID() : sourceId);
    sceneByEnvironment.set(sourceId, String(id)); usedSceneIds.add(String(id));
    if (!existing) scenes.push(snake ? {
      id, [campaignKey]: environment[campaignKey], [chapterKey]: chapterId, environment_id: environment.id, title: environment.name, description: environment.description ?? '', notes: environment.notes ?? '', status: 'draft', image_url: environment.image_url ?? null, sort_order: Math.max(0, environment.sort_order ?? 0), next_scene_ids: [], map_regions: [], context_metadata: { timeOfDay: '', period: '', condition: '' }, [sourceKey]: environment,
      created_at: environment.created_at ?? new Date().toISOString(), updated_at: environment.updated_at ?? new Date().toISOString(),
    } : normalizeSceneSpatialValue({ id, campaignId: environment.campaignId, chapterId, environmentId: environment.id, title: environment.name, description: environment.description ?? '', notes: environment.notes ?? '', imageUrl: environment.imageUrl ?? null, sortOrder: Math.max(0, environment.sortOrder ?? 0), sourceEnvironment: environment, createdAt: environment.createdAt, updatedAt: environment.updatedAt }));
  }

  for (const table of ['npcs', 'monsters', 'clues', 'situations']) {
    if (!Array.isArray(tables[table])) continue;
    const environmentKey = key('environmentId', 'environment_id');
    tables[table] = tables[table].map(row => {
      const environmentId = row[environmentKey] && String(row[environmentKey]);
      if (!environmentId) return row;
      const rootId = byId.has(environmentId) ? rootOf(byId.get(environmentId)!) : null;
      const chapterId = rootId ? chapterByRoot.get(rootId) : null;
      return chapterId ? { ...row, [chapterKey]: chapterId, [sceneKey]: sceneByEnvironment.get(environmentId) ?? null } : row;
    });
  }
  return tables;
}

export interface SpatialDomainTables {
  chapters: JsonRow[];
  scenes: JsonRow[];
  environments: JsonRow[];
}

/** Pure conversion used by local mode and backups. Environments are only an
 * input: the compatibility rows are returned untouched so nothing is deleted. */
export function migrateBackupToSpatialDomain(input: {
  chapters?: unknown;
  scenes?: unknown;
  environments?: unknown;
}): SpatialDomainTables {
  const tables = migrateEnvironmentDomainTables({
    chapters: Array.isArray(input.chapters) ? (input.chapters as JsonRow[]) : [],
    scenes: Array.isArray(input.scenes) ? (input.scenes as JsonRow[]) : [],
    environments: Array.isArray(input.environments) ? (input.environments as JsonRow[]) : [],
  });

  return {
    chapters: Array.isArray(tables.chapters) ? tables.chapters : [],
    scenes: Array.isArray(tables.scenes) ? tables.scenes : [],
    environments: Array.isArray(tables.environments) ? tables.environments : [],
  };
}

function environmentIdOf(value: Record<string, unknown> | null | undefined): string | null {
  if (!value || typeof value !== 'object') return null;
  const id = (value as { id?: unknown }).id;
  return id === undefined || id === null ? null : String(id);
}

/** Maps a legacy environment id to its migrated chapter using the persisted
 * markers (`sourceEnvironment` on chapters, `environmentId` on scenes). */
export function buildEnvironmentChapterMapping(chapters: Chapter[], scenes: Scene[] = []): Map<string, string> {
  const mapping = new Map<string, string>();
  for (const scene of scenes) {
    if (scene.environmentId && scene.chapterId) mapping.set(String(scene.environmentId), String(scene.chapterId));
  }
  for (const chapter of chapters) {
    const sourceId = environmentIdOf(chapter.sourceEnvironment);
    if (sourceId) mapping.set(sourceId, String(chapter.id));
  }
  return mapping;
}

export function resolveChapterIdForEnvironment(
  environmentId: string | null | undefined,
  chapters: Chapter[],
  scenes: Scene[] = []
): string | null {
  if (!environmentId) return null;
  const direct = chapters.find(chapter => chapter.id === environmentId);
  if (direct) return String(direct.id);
  return buildEnvironmentChapterMapping(chapters, scenes).get(String(environmentId)) ?? null;
}

/** Resolves a navigation target that may still carry a pre-cutover environment
 * id: both `chapter` and `environment` entity types land on the same Chapter. */
export function resolveChapterNavigation(
  entityId: string,
  chapters: Chapter[],
  scenes: Scene[] = []
): Chapter | null {
  const direct = chapters.find(chapter => chapter.id === entityId);
  if (direct) return direct;
  const chapterId = resolveChapterIdForEnvironment(entityId, chapters, scenes);
  return chapterId ? chapters.find(chapter => chapter.id === chapterId) ?? null : null;
}
