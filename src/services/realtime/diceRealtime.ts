import { projectId } from '/utils/supabase/info';
import { isDiceSkinId } from '../../app/components/session/dice/diceSkins.ts';
import type { RollResult } from '../../app/components/session/dice/diceTypes.ts';

const SECRET_DICE_RELAY_URL = `https://${projectId}.supabase.co/functions/v1/dice-secret-roll`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableFinite(value: unknown) {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isDiceAppearance(value: unknown) {
  if (!isRecord(value)) return false;
  return typeof value.bodyColor === 'string'
    && value.bodyColor.length > 0
    && typeof value.symbolColor === 'string'
    && value.symbolColor.length > 0
    && isDiceSkinId(value.skinId)
    && typeof value.effectsEnabled === 'boolean';
}

function isCustomFace(value: unknown) {
  if (!isRecord(value)) return false;
  if (typeof value.index !== 'number' || !Number.isInteger(value.index) || value.index < 1) return false;
  if (value.role !== 'single' && value.role !== 'tens' && value.role !== 'units') return false;
  if (value.numericValue !== null && value.numericValue !== undefined && (typeof value.numericValue !== 'number' || !Number.isFinite(value.numericValue))) return false;
  if (!isRecord(value.visual)) return false;
  if (value.visual.kind === 'icon') return typeof value.visual.iconName === 'string' && value.visual.iconName.length > 0;
  if (value.visual.kind === 'image') {
    return typeof value.visual.assetPath === 'string' && value.visual.assetPath.length > 0
      && typeof value.visual.publicUrl === 'string' && value.visual.publicUrl.length > 0;
  }
  if (value.visual.kind === 'text') return typeof value.visual.text === 'string' && value.visual.text.trim().length > 0;
  return false;
}

function isCustomDieSnapshot(value: unknown) {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || !value.id.length) return false;
  if (typeof value.name !== 'string' || !value.name.length) return false;
  if (![4, 6, 8, 10, 12, 20, 100].includes(Number(value.sides))) return false;
  if (!Array.isArray(value.faces) || !value.faces.every(isCustomFace)) return false;
  if (typeof value.bodyColor !== 'string' || typeof value.symbolColor !== 'string') return false;
  if (value.skinId !== undefined && !isDiceSkinId(value.skinId)) return false;
  if (value.effectsEnabled !== undefined && typeof value.effectsEnabled !== 'boolean') return false;
  return true;
}

function isRollDiePayload(value: unknown) {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || !value.id.length) return false;
  if (typeof value.groupItemId !== 'string' || !value.groupItemId.length) return false;
  if (typeof value.sides !== 'number' || !Number.isFinite(value.sides)) return false;
  if (typeof value.face !== 'number' || !Number.isFinite(value.face)) return false;
  if (!isNullableFinite(value.contribution)) return false;
  if (typeof value.active !== 'boolean') return false;
  if (value.keepMatched !== undefined && typeof value.keepMatched !== 'boolean') return false;
  if (value.customDieId !== undefined && typeof value.customDieId !== 'string') return false;
  if (value.customDieName !== undefined && typeof value.customDieName !== 'string') return false;
  if (value.physicalRole !== undefined && value.physicalRole !== 'single' && value.physicalRole !== 'tens' && value.physicalRole !== 'units') return false;
  if (value.logicalRollIndex !== undefined && (!Number.isInteger(value.logicalRollIndex) || Number(value.logicalRollIndex) < 0)) return false;
  if (value.customFace !== undefined && !isCustomFace(value.customFace)) return false;
  return true;
}

function isDiceGroupPayload(value: unknown) {
  if (!isRecord(value)) return false;
  if (typeof value.itemId !== 'string' || !value.itemId.length) return false;
  if (!Array.isArray(value.rolls) || !value.rolls.every(isRollDiePayload)) return false;
  if (!Array.isArray(value.activeRollIds) || !value.activeRollIds.every((id) => typeof id === 'string')) return false;
  if (!isNullableFinite(value.contribution)) return false;
  if (value.appearance !== undefined && !isDiceAppearance(value.appearance)) return false;
  if (value.customDieSnapshot !== undefined && !isCustomDieSnapshot(value.customDieSnapshot)) return false;
  return true;
}

function isArithmeticStepPayload(value: unknown) {
  if (!isRecord(value)) return false;
  if (typeof value.itemId !== 'string' || !value.itemId.length) return false;
  if (value.scope !== 'dice' && value.scope !== 'total') return false;
  if (value.scope === 'dice' && (typeof value.groupItemId !== 'string' || !value.groupItemId.length)) return false;
  if (value.scope === 'total' && value.groupItemId !== undefined) return false;
  if (typeof value.before !== 'number' || !Number.isFinite(value.before) || typeof value.after !== 'number' || !Number.isFinite(value.after)) return false;
  return true;
}

export function isRollResultPayload(value: unknown): value is RollResult {
  if (!isRecord(value)) return false;
  for (const key of ['id', 'campaignId', 'rollerId', 'rollerName', 'formulaName', 'formulaText'] as const) {
    if (typeof value[key] !== 'string' || !value[key].length) return false;
  }
  if (value.visibility !== 'public' && value.visibility !== 'secret') return false;
  if (!isNullableFinite(value.total)) return false;
  if (typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) return false;
  if (!Array.isArray(value.sourceItems)) return false;
  if (!Array.isArray(value.diceGroups) || !value.diceGroups.every(isDiceGroupPayload)) return false;
  if (!Array.isArray(value.arithmeticSteps) || !value.arithmeticSteps.every(isArithmeticStepPayload)) return false;
  if (!Array.isArray(value.comparisons)) return false;
  if (value.formulaId !== undefined && typeof value.formulaId !== 'string') return false;
  if (value.rollerAvatarUrl !== undefined && typeof value.rollerAvatarUrl !== 'string') return false;
  return true;
}

export async function sendSecretRollToGm(campaignId: string, result: RollResult, accessToken: string): Promise<void> {
  const response = await fetch(SECRET_DICE_RELAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ campaignId, result }),
  });
  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = typeof data?.error === 'string' ? `: ${data.error}` : '';
    } catch {
      // The relay can return a non-JSON gateway error.
    }
    throw new Error(`Secret dice relay failed (${response.status})${detail}`);
  }
}
