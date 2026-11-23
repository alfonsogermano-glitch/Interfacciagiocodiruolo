// Last-resort boundary for pure utilities which also import legacy transports.
// Truthy proxy avoids silently switching those modules into IndexedDB mode.
export const isSupabaseConfigured=false;
export const supabase=new Proxy({},{
 get(){throw Error('Trasporto legacy non disponibile su Aruba: nessuna modifica eseguita.');},
});
