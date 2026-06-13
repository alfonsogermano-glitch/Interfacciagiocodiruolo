import { useState, useRef, useEffect } from 'react';
import { Map, MapPin, Plus, X } from 'lucide-react';
import { CAMPAIGN_STORAGE_KEYS } from '../../../services/campaign/campaignStorageKeys';
import { generateUUID } from '../../../lib/uuid';

interface Location {
  id: string;
  name: string;
  x: number;
  y: number;
  description: string;
}

interface ContextMenu {
  x: number;
  y: number;
  locationId: string;
}

interface GameMapState {
  locations: Location[];
  mapNotes: string;
}

const MAP_STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.maps;

const DEFAULT_MAP_STATE: GameMapState = {
  locations: [],
  mapNotes: ''
};

export function GameMap() {
  const [mapState, setMapState] = useState<GameMapState>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_MAP_STATE;
    }

    try {
      const savedMap = window.localStorage.getItem(MAP_STORAGE_KEY);

      if (!savedMap) {
        return DEFAULT_MAP_STATE;
      }

      const parsedMap = JSON.parse(savedMap);

      if (!parsedMap || typeof parsedMap !== 'object') {
        return DEFAULT_MAP_STATE;
      }

      return {
        locations: Array.isArray(parsedMap.locations)
          ? parsedMap.locations
          : DEFAULT_MAP_STATE.locations,
        mapNotes:
          typeof parsedMap.mapNotes === 'string'
            ? parsedMap.mapNotes
            : ''
      };
    } catch (error) {
      console.error('Errore nel caricamento della mappa da localStorage:', error);
      return DEFAULT_MAP_STATE;
    }
  });

  const { locations, mapNotes } = mapState;

  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [draggingLocation, setDraggingLocation] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        MAP_STORAGE_KEY,
        JSON.stringify(mapState)
      );
    } catch (error) {
      console.error('Errore nel salvataggio della mappa su localStorage:', error);
    }
  }, [mapState]);

  const updateLocations = (nextLocations: Location[]) => {
    setMapState(prev => ({
      ...prev,
      locations: nextLocations
    }));
  };

  const addLocation = () => {
    const newLocation: Location = {
      id: generateUUID(),
      name: 'Nuova Locazione',
      x: 300,
      y: 200,
      description: ''
    };

    updateLocations([...locations, newLocation]);
    setSelectedLocation(newLocation);
  };

  useEffect(() => {
    if (!draggingLocation) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!mapRef.current) {
        return;
      }

      const rect = mapRef.current.getBoundingClientRect();
      const x = Math.max(
        0,
        Math.min(rect.width, e.clientX - rect.left - dragOffset.x)
      );
      const y = Math.max(
        0,
        Math.min(rect.height, e.clientY - rect.top - dragOffset.y)
      );

      const nextLocations = locations.map(loc =>
        loc.id === draggingLocation ? { ...loc, x, y } : loc
      );

      updateLocations(nextLocations);

      if (selectedLocation?.id === draggingLocation) {
        setSelectedLocation(prev => (prev ? { ...prev, x, y } : null));
      }
    };

    const handleMouseUp = () => {
      setDraggingLocation(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingLocation, dragOffset, selectedLocation, locations]);

  const handleMouseDown = (e: React.MouseEvent, locationId: string) => {
    if (e.button !== 0) {
      return;
    }

    e.preventDefault();

    const location = locations.find(loc => loc.id === locationId);

    if (!location || !mapRef.current) {
      return;
    }

    const rect = mapRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - location.x;
    const offsetY = e.clientY - rect.top - location.y;

    setDraggingLocation(locationId);
    setDragOffset({ x: offsetX, y: offsetY });
    setContextMenu(null);
  };

  const handleContextMenu = (e: React.MouseEvent, locationId: string) => {
    e.preventDefault();

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      locationId
    });
  };

  const removeLocation = (locationId: string) => {
    const nextLocations = locations.filter(loc => loc.id !== locationId);
    updateLocations(nextLocations);

    if (selectedLocation?.id === locationId) {
      setSelectedLocation(null);
    }

    setContextMenu(null);
  };

  const handleClickOutside = () => {
    setContextMenu(null);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" onClick={handleClickOutside}>
      <div className="lg:col-span-2">
        <div className="rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-surface-2)] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[var(--dash-text)]">Mappa di Gioco</h2>

            <button
              onClick={addLocation}
              className="flex items-center gap-2 rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-border)] px-4 py-2 text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-border)]"
            >
              <Plus className="h-5 w-5" />
              Aggiungi Locazione
            </button>
          </div>

          <div
            ref={mapRef}
            className="relative h-[500px] w-full overflow-hidden rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-input)]"
          >
            <div className="absolute inset-0">
              <svg className="h-full w-full opacity-20">
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path
                      d="M 40 0 L 0 0 0 40"
                      fill="none"
                      stroke="var(--dash-border)"
                      strokeWidth="1"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>

              {locations.map(location => (
                <div
                  key={location.id}
                  onMouseDown={e => handleMouseDown(e, location.id)}
                  onContextMenu={e => handleContextMenu(e, location.id)}
                  onClick={e => {
                    e.stopPropagation();

                    if (!draggingLocation) {
                      setSelectedLocation(location);
                    }
                  }}
                  style={{
                    position: 'absolute',
                    left: `${location.x}px`,
                    top: `${location.y}px`,
                    transform: 'translate(-50%, -50%)',
                    cursor: draggingLocation === location.id ? 'grabbing' : 'grab',
                    transition:
                      draggingLocation === location.id
                        ? 'none'
                        : 'transform 0.2s ease-out'
                  }}
                  className={`select-none ${
                    selectedLocation?.id === location.id &&
                    draggingLocation !== location.id
                      ? 'scale-110'
                      : draggingLocation === location.id
                      ? 'scale-105 opacity-80'
                      : 'hover:scale-105'
                  }`}
                >
                  <div
                    className={`flex flex-col items-center ${
                      selectedLocation?.id === location.id
                        ? 'text-[var(--dash-accent)]'
                        : 'text-[var(--dash-text)]'
                    }`}
                  >
                    <MapPin className="h-8 w-8 drop-shadow-lg" />
                    <span className="mt-1 whitespace-nowrap rounded border border-[var(--dash-border)] bg-[var(--dash-surface-2)] px-2 py-1 text-xs">
                      {location.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <h3 className="mb-2 text-[var(--dash-text)]">Note sulla Mappa</h3>
            <textarea
              value={mapNotes}
              onChange={e =>
                setMapState(prev => ({
                  ...prev,
                  mapNotes: e.target.value
                }))
              }
              placeholder="Annotazioni generali sulla mappa..."
              className="h-24 w-full resize-none rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-input)] p-3 text-[var(--dash-text)]"
            />
          </div>
        </div>
      </div>

      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 1000
          }}
          onClick={e => e.stopPropagation()}
          className="min-w-[200px] overflow-hidden rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-surface-2)] shadow-2xl"
        >
          <button
            onClick={() => removeLocation(contextMenu.locationId)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-border)]"
          >
            <X className="h-4 w-4 text-[var(--dash-accent)]" />
            Rimuovi Locazione
          </button>

          <div className="border-t border-[var(--dash-border)] px-4 py-2 text-xs text-[var(--dash-muted)]">
            Altri comandi in arrivo...
          </div>
        </div>
      )}

      <div className="lg:col-span-1">
        {selectedLocation ? (
          <div className="space-y-4 rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-surface-2)] p-6">
            <div>
              <h2 className="mb-4 text-[var(--dash-text)]">Dettagli Locazione</h2>
            </div>

            <div>
              <label className="mb-2 block text-[var(--dash-text)]">Nome</label>
              <input
                type="text"
                value={selectedLocation.name}
                onChange={e => {
                  const updated = {
                    ...selectedLocation,
                    name: e.target.value
                  };

                  updateLocations(
                    locations.map(loc => (loc.id === updated.id ? updated : loc))
                  );
                  setSelectedLocation(updated);
                }}
                className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
              />
            </div>

            <div>
              <label className="mb-2 block text-[var(--dash-text)]">Descrizione</label>
              <textarea
                value={selectedLocation.description}
                onChange={e => {
                  const updated = {
                    ...selectedLocation,
                    description: e.target.value
                  };

                  updateLocations(
                    locations.map(loc => (loc.id === updated.id ? updated : loc))
                  );
                  setSelectedLocation(updated);
                }}
                className="h-32 w-full resize-none rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                placeholder="Descrizione della locazione..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-[var(--dash-text)]">Posizione X</label>
                <input
                  type="number"
                  value={selectedLocation.x}
                  onChange={e => {
                    const updated = {
                      ...selectedLocation,
                      x: parseInt(e.target.value, 10) || 0
                    };

                    updateLocations(
                      locations.map(loc => (loc.id === updated.id ? updated : loc))
                    );
                    setSelectedLocation(updated);
                  }}
                  className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                />
              </div>

              <div>
                <label className="mb-2 block text-[var(--dash-text)]">Posizione Y</label>
                <input
                  type="number"
                  value={selectedLocation.y}
                  onChange={e => {
                    const updated = {
                      ...selectedLocation,
                      y: parseInt(e.target.value, 10) || 0
                    };

                    updateLocations(
                      locations.map(loc => (loc.id === updated.id ? updated : loc))
                    );
                    setSelectedLocation(updated);
                  }}
                  className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                />
              </div>
            </div>

            <button
              onClick={() => {
                if (confirm('Eliminare questa locazione?')) {
                  updateLocations(
                    locations.filter(loc => loc.id !== selectedLocation.id)
                  );
                  setSelectedLocation(null);
                }
              }}
              className="w-full rounded border border-[var(--dash-border)] bg-[var(--dash-border)] py-2 text-[var(--dash-text)] hover:bg-red-900"
            >
              Elimina Locazione
            </button>
          </div>
        ) : (
          <div className="rounded-lg border-2 border-[var(--dash-border)] bg-[var(--dash-surface-2)] p-12 text-center">
            <Map className="mx-auto mb-4 h-16 w-16 text-[var(--dash-border)]" />
            <p className="text-[var(--dash-muted)]">
              Seleziona una locazione sulla mappa o creane una nuova
            </p>
          </div>
        )}
      </div>
    </div>
  );
}