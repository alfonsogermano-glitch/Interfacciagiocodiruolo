import type { Equipment } from '../../types/character';
import type {
  CharacterEquipmentItem,
  EquipmentLocation,
  EquipmentType
} from '../../types/equipment';

export const MAX_TASCABILI_IN_TASCA = 5;
export const MAX_TRASPORTABILI_ATTIVI = 4;
export const BACKPACK_NAME = 'Zaino';

export type EquipmentLike =
  | Equipment
  | Pick<
      CharacterEquipmentItem,
      'id' | 'name' | 'type' | 'description' | 'location' | 'inseparabile' | 'isVehicle'
    >;

export interface EquipmentValidationResult {
  valid: boolean;
  reason?: string;
}

export function isBackpack(item?: Partial<EquipmentLike> | null): boolean {
  return item?.name === BACKPACK_NAME;
}

export function isPocketItem(item?: Partial<EquipmentLike> | null): boolean {
  return item?.type === 'tascabile';
}

export function isTransportable(item?: Partial<EquipmentLike> | null): boolean {
  return item?.type === 'trasportabile' || item?.type === 'arma';
}

export function isVehicleResource(item?: Partial<EquipmentLike> | null): boolean {
  return item?.type === 'risorsa' && item?.isVehicle === true;
}

export function isNonVehicleResource(item?: Partial<EquipmentLike> | null): boolean {
  return item?.type === 'risorsa' && item?.isVehicle !== true;
}

export function hasBackpack(equipment: EquipmentLike[]): boolean {
  return equipment.some(item => isBackpack(item));
}

export function countPocketItemsInPocket(
  equipment: EquipmentLike[],
  excludeItemId?: string
): number {
  return equipment.filter(item => {
    if (excludeItemId && item.id === excludeItemId) {
      return false;
    }

    return isPocketItem(item) && item.location === 'in_tasca';
  }).length;
}

export function countActiveTransportables(
  equipment: EquipmentLike[],
  excludeItemId?: string
): number {
  return equipment.filter(item => {
    if (excludeItemId && item.id === excludeItemId) {
      return false;
    }

    if (!isTransportable(item) || isBackpack(item)) {
      return false;
    }

    return item.location === 'indossato' || item.location === 'nel_zaino';
  }).length;
}

export function getExistingInseparableItem(
  equipment: EquipmentLike[],
  excludeItemId?: string
): EquipmentLike | null {
  return (
    equipment.find(item => {
      if (excludeItemId && item.id === excludeItemId) {
        return false;
      }

      return isTransportable(item) && !isBackpack(item) && item.inseparabile === true;
    }) ?? null
  );
}

export function getAllowedLocationsForItem(
  item: Pick<EquipmentLike, 'name' | 'type' | 'isVehicle'>,
  equipment: EquipmentLike[]
): EquipmentLocation[] {
  const backpackAvailable = hasBackpack(equipment);

  if (item.type === 'tascabile') {
    return ['in_tasca', 'a_casa'];
  }

  if (item.type === 'trasportabile' || item.type === 'arma') {
    if (isBackpack(item)) {
      return ['indossato', 'a_casa'];
    }

    return backpackAvailable
      ? ['indossato', 'nel_zaino', 'a_casa']
      : ['indossato', 'a_casa'];
  }

  if (item.type === 'risorsa' && item.isVehicle) {
    return ['a_casa', 'disponibile'];
  }

  return ['a_casa'];
}

export function getPreferredLocationForItem(
  item: Pick<EquipmentLike, 'name' | 'type' | 'isVehicle' | 'inseparabile'>,
  equipment: EquipmentLike[]
): EquipmentLocation {
  if (isTransportable(item) && !isBackpack(item) && item.inseparabile) {
    return hasBackpack(equipment) ? 'nel_zaino' : 'indossato';
  }

  return getAllowedLocationsForItem(item, equipment)[0];
}

export function canItemBeMarkedInseparable(
  item: Pick<EquipmentLike, 'name' | 'type'>
): boolean {
  return isTransportable(item) && !isBackpack(item);
}

export function validateEquipmentLocationChange(
  item: EquipmentLike,
  nextLocation: EquipmentLocation,
  equipment: EquipmentLike[]
): EquipmentValidationResult {
  const allowedLocations = getAllowedLocationsForItem(item, equipment);

  if (!allowedLocations.includes(nextLocation)) {
    return {
      valid: false,
      reason: 'Questa posizione non è consentita per questo oggetto.'
    };
  }

  if (isPocketItem(item) && nextLocation === 'in_tasca') {
    const currentPocketCount = countPocketItemsInPocket(equipment, item.id);

    if (currentPocketCount >= MAX_TASCABILI_IN_TASCA) {
      return {
        valid: false,
        reason: `Puoi avere al massimo ${MAX_TASCABILI_IN_TASCA} tascabili in tasca.`
      };
    }
  }

  if (
    isTransportable(item) &&
    !isBackpack(item) &&
    (nextLocation === 'indossato' || nextLocation === 'nel_zaino')
  ) {
    const currentActiveCount = countActiveTransportables(equipment, item.id);

    if (currentActiveCount >= MAX_TRASPORTABILI_ATTIVI) {
      return {
        valid: false,
        reason: `Puoi avere al massimo ${MAX_TRASPORTABILI_ATTIVI} trasportabili attivi.`
      };
    }
  }

  return { valid: true };
}

export function validateInseparableToggle(
  item: EquipmentLike,
  nextInseparabile: boolean,
  equipment: EquipmentLike[]
): EquipmentValidationResult {
  if (!canItemBeMarkedInseparable(item)) {
    return {
      valid: false,
      reason: 'Solo trasportabili e armi, escluso lo zaino, possono essere inseparabili.'
    };
  }

  if (!nextInseparabile) {
    return { valid: true };
  }

  const existing = getExistingInseparableItem(equipment, item.id);

  if (existing) {
    return {
      valid: false,
      reason: 'Puoi avere un solo oggetto inseparabile.'
    };
  }

  const preferredLocation = getPreferredLocationForItem(
    {
      ...item,
      inseparabile: true
    },
    equipment
  );

  return validateEquipmentLocationChange(
    {
      ...item,
      inseparabile: true,
      location: preferredLocation
    },
    preferredLocation,
    equipment
  );
}

export function validateNewEquipmentItem(
  item: Pick<
    EquipmentLike,
    'name' | 'type' | 'description' | 'location' | 'inseparabile' | 'isVehicle'
  >,
  equipment: EquipmentLike[]
): EquipmentValidationResult {
  if (!item.name?.trim()) {
    return {
      valid: false,
      reason: 'Il nome dell’oggetto è obbligatorio.'
    };
  }

  if (isBackpack(item) && hasBackpack(equipment)) {
    return {
      valid: false,
      reason: 'Il personaggio ha già uno zaino.'
    };
  }

  const locationValidation = validateEquipmentLocationChange(
    {
      id: '__new__',
      ...item
    },
    item.location,
    equipment
  );

  if (!locationValidation.valid) {
    return locationValidation;
  }

  if (item.inseparabile) {
    const inseparableValidation = validateInseparableToggle(
      {
        id: '__new__',
        ...item
      },
      true,
      equipment
    );

    if (!inseparableValidation.valid) {
      return inseparableValidation;
    }
  }

  return { valid: true };
}

export function getLocationLabel(location: EquipmentLocation): string {
  switch (location) {
    case 'in_tasca':
      return 'In tasca';
    case 'nel_zaino':
      return 'Nello zaino';
    case 'indossato':
      return 'Addosso';
    case 'a_casa':
      return 'A casa';
    case 'disponibile':
      return 'Disponibile';
    default:
      return location;
  }
}

export function getEquipmentTypeLabel(type: EquipmentType): string {
  switch (type) {
    case 'tascabile':
      return 'Tascabile';
    case 'trasportabile':
      return 'Trasportabile';
    case 'risorsa':
      return 'Risorsa';
    case 'arma':
      return 'Arma';
    default:
      return type;
  }
}