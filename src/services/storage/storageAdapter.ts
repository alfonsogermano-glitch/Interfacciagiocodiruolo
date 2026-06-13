export type EntityId = string;

export interface BaseStoredEntity {
  id: EntityId;
}

export interface StorageAdapter<T extends BaseStoredEntity> {
  getAll(): Promise<T[]>;
  getById(id: EntityId): Promise<T | null>;
  setAll(items: T[]): Promise<void>;
  upsert(item: T): Promise<T>;
  remove(id: EntityId): Promise<void>;
  clear(): Promise<void>;
}