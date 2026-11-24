// Quarantine until authoritative legacy schema and ownership mappings have
// been verified against an isolated restore. Construction is not activation.
export function configureHistoricalCatalog({flag}={}){
 if(flag!==undefined&&flag!==''&&!['true','false'].includes(flag))
  throw Error('Unsupported AUTH_VTT_HISTORICAL_CATALOG_ENABLED value');
 if(flag==='true')throw Error('Historical catalog is blocked pending schema and ownership acceptance');
 return null;
}
