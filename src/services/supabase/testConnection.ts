import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';

/**
 * Testa la connessione a Supabase e verifica se le tabelle esistono
 */
export async function testSupabaseConnection() {
  if (!isSupabaseConfigured || !supabase) {
    return {
      connected: false,
      tablesExist: false,
      error: 'Supabase non configurato'
    };
  }

  try {
    console.log('🔍 Verifica connessione Supabase...');

    const { error: healthError } = await supabase
      .from('campaigns')
      .select('count')
      .limit(1);

    if (healthError) {
      if (
        healthError.message.includes('relation') &&
        healthError.message.includes('does not exist')
      ) {
        return {
          connected: true,
          tablesExist: false,
          error: 'Tabelle non create. Esegui supabase-schema.sql'
        };
      }

      return {
        connected: false,
        tablesExist: false,
        error: healthError.message
      };
    }

    const tables = [
      'campaigns',
      'characters',
      'equipment_catalog',
      'character_equipment',
      'npcs',
      'monsters',
      'adventures',
      'environments',
      'clues',
      'situations',
      'visual_assets'
    ];

    const tableStatus: Record<string, boolean> = {};

    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .select('count')
        .limit(1);

      tableStatus[table] = !error;
    }

    const allTablesExist = Object.values(tableStatus).every(Boolean);

    return {
      connected: true,
      tablesExist: allTablesExist,
      tableStatus,
      message: allTablesExist
        ? 'Database completamente configurato!'
        : 'Alcune tabelle mancano. Esegui supabase-schema.sql'
    };
  } catch (error) {
    return {
      connected: false,
      tablesExist: false,
      error: error instanceof Error ? error.message : 'Errore sconosciuto'
    };
  }
}

/**
 * Crea una campagna di test per verificare che tutto funzioni
 */
export async function createTestCampaign() {
  if (!isSupabaseConfigured || !supabase) {
    return {
      success: false,
      error: 'Supabase non configurato'
    };
  }

  try {
    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        name: 'Campagna di Test',
        description: 'Campagna creata automaticamente per testare la connessione',
        drama: 1,
        owner_profile_id: 'test-user'
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Errore sconosciuto'
    };
  }
}