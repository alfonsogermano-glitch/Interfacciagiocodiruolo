import { supabase } from '../../app/auth/AuthContext';
import type { CustomDieSides, StandardDieAppearance } from '../../app/components/session/dice/diceTypes.ts';

interface StandardDieStyleRow {
  campaign_id: string;
  owner_profile_id: string;
  sides: number;
  body_color: string;
  symbol_color: string;
  skin_id: StandardDieAppearance['skinId'];
  effects_enabled: boolean;
}

function mapRow(row: StandardDieStyleRow): StandardDieAppearance {
  return {
    sides: row.sides as CustomDieSides,
    bodyColor: row.body_color,
    symbolColor: row.symbol_color,
    skinId: row.skin_id,
    effectsEnabled: row.effects_enabled,
  };
}

export async function loadStandardDiceStyles(
  campaignId: string,
  ownerProfileId: string,
): Promise<StandardDieAppearance[]> {
  const { data, error } = await supabase
    .from('dice_standard_styles')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('owner_profile_id', ownerProfileId)
    .order('sides', { ascending: true });
  if (error) throw new Error(`Errore caricamento personalizzazione dadi: ${error.message}`);
  return (data ?? []).map((row) => mapRow(row as StandardDieStyleRow));
}

export async function saveStandardDiceStyles(
  campaignId: string,
  ownerProfileId: string,
  styles: readonly StandardDieAppearance[],
): Promise<StandardDieAppearance[]> {
  const updatedAt = new Date().toISOString();
  const payload = styles.map((style) => ({
    campaign_id: campaignId,
    owner_profile_id: ownerProfileId,
    sides: style.sides,
    body_color: style.bodyColor,
    symbol_color: style.symbolColor,
    skin_id: style.skinId,
    effects_enabled: style.effectsEnabled,
    updated_at: updatedAt,
  }));
  const { data, error } = await supabase
    .from('dice_standard_styles')
    .upsert(payload, { onConflict: 'campaign_id,owner_profile_id,sides' })
    .select('*');
  if (error) throw new Error(`Errore salvataggio personalizzazione dadi: ${error.message}`);
  return (data ?? []).map((row) => mapRow(row as StandardDieStyleRow));
}
