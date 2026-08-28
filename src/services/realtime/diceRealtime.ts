import { supabase } from '../../app/auth/AuthContext';
import type { RollResult } from '../../app/components/session/dice/diceTypes.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  if (!Array.isArray(value.diceGroups)) return false;
  if (!Array.isArray(value.arithmeticSteps)) return false;
  if (!Array.isArray(value.comparisons)) return false;
  if (value.formulaId !== undefined && typeof value.formulaId !== 'string') return false;
  if (value.rollerAvatarUrl !== undefined && typeof value.rollerAvatarUrl !== 'string') return false;

  return true;
}

export async function sendSecretRollToGm(campaignId: string, result: RollResult): Promise<void> {
  await supabase.realtime.setAuth();
  const channel = supabase.channel(`dice-gm:${campaignId}`, {
    config: { private: true },
  });

  try {
    const response = await channel.httpSend('dice_roll', result);
    if (response.success === false) {
      throw new Error(`Secret dice broadcast failed: ${response.error}`);
    }
  } finally {
    await supabase.removeChannel(channel);
  }
}
