import { projectId } from '/utils/supabase/info';
import type { RollResult } from '../../app/components/session/dice/diceTypes.ts';

const SECRET_DICE_RELAY_URL = `https://${projectId}.supabase.co/functions/v1/dice-secret-roll`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRollDiePayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.groupItemId !== 'string' || value.groupItemId.length === 0) return false;
  if (typeof value.sides !== 'number' || !Number.isFinite(value.sides)) return false;
  if (typeof value.face !== 'number' || !Number.isFinite(value.face)) return false;
  if (typeof value.contribution !== 'number' || !Number.isFinite(value.contribution)) return false;
  if (typeof value.active !== 'boolean') return false;
  if (value.keepMatched !== undefined && typeof value.keepMatched !== 'boolean') return false;
  return true;
}

function isDiceGroupPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.itemId !== 'string' || value.itemId.length === 0) return false;
  if (!Array.isArray(value.rolls) || !value.rolls.every(isRollDiePayload)) return false;
  if (!Array.isArray(value.activeRollIds) || !value.activeRollIds.every((id) => typeof id === 'string')) return false;
  if (typeof value.contribution !== 'number' || !Number.isFinite(value.contribution)) return false;
  return true;
}

function isArithmeticStepPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.itemId !== 'string' || value.itemId.length === 0) return false;
  if (value.scope !== 'dice' && value.scope !== 'total') return false;
  if (value.scope === 'dice' && (typeof value.groupItemId !== 'string' || value.groupItemId.length === 0)) return false;
  if (value.scope === 'total' && value.groupItemId !== undefined) return false;
  if (typeof value.before !== 'number' || !Number.isFinite(value.before)) return false;
  if (typeof value.after !== 'number' || !Number.isFinite(value.after)) return false;
  return true;
}

export function isRollResultPayload(value: unknown): value is RollResult {
  if (!isRecord(value)) return false;

  const requiredStrings = [
    'id',
    'campaignId',
    'rollerId',
    'rollerName',
    'formulaName',
    'formulaText',
  ] as const;

  for (const key of requiredStrings) {
    if (typeof value[key] !== 'string' || value[key].length === 0) return false;
  }

  if (value.visibility !== 'public' && value.visibility !== 'secret') return false;
  if (typeof value.total !== 'number' || !Number.isFinite(value.total)) return false;
  if (typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) return false;
  if (!Array.isArray(value.sourceItems)) return false;
  if (!Array.isArray(value.diceGroups) || !value.diceGroups.every(isDiceGroupPayload)) return false;
  if (!Array.isArray(value.arithmeticSteps) || !value.arithmeticSteps.every(isArithmeticStepPayload)) return false;
  if (!Array.isArray(value.comparisons)) return false;
  if (value.formulaId !== undefined && typeof value.formulaId !== 'string') return false;
  if (value.rollerAvatarUrl !== undefined && typeof value.rollerAvatarUrl !== 'string') return false;

  return true;
}

export async function sendSecretRollToGm(
  campaignId: string,
  result: RollResult,
  accessToken: string,
): Promise<void> {
  const response = await fetch(SECRET_DICE_RELAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ campaignId, result }),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = typeof data?.error === 'string' ? `: ${data.error}` : '';
    } catch {
      // La risposta HTTP è già sufficiente per segnalare l'errore.
    }
    throw new Error(`Secret dice relay failed (${response.status})${detail}`);
  }
}
