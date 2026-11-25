/** Read-only compatibility for migration payloads that retained SQL timestamps.
 * A malformed modern field must not be rescued by an older alias. */
function legacyUtcTimestamp(value){
 if(typeof value!=='string'||
  !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value))
  return value;
 const time=Date.parse(value);
 if(Number.isNaN(time))return value;
 const canonical=new Date(time).toISOString();
 // Do not normalize invalid calendar dates, 24:00 or leap seconds to new dates.
 return canonical.slice(0,19)===value.slice(0,19)?canonical:value;
}
export function normalizeChapterReadModel(chapter){
 if(!chapter||typeof chapter!=='object'||Array.isArray(chapter))return chapter;
 const normalized={...chapter};
 for(const [modern,legacy] of [['createdAt','created_at'],['updatedAt','updated_at']]){
  if(!Object.hasOwn(chapter,modern)&&Object.hasOwn(chapter,legacy))
   normalized[modern]=legacyUtcTimestamp(chapter[legacy]);
 }
 return normalized;
}
