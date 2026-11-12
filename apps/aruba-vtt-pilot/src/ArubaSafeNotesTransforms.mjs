/**
 * Keep ORIGINAL SessionNotesPanel / TrashRow DOM and CSS, but strip only
 * unsupported destructive controls in the isolated Aruba Vite build.
 * Fail loudly whenever upstream source changes so a destructive button
 * can never reappear silently.
 */
function removeOnce(source,start,end,reason){
 const a=source.indexOf(start);
 if(a<0||source.indexOf(start,a+1)!==-1)throw Error(reason+': anchor changed');
 const b=source.indexOf(end,a+start.length);
 if(b<0)throw Error(reason+': end anchor changed');
 return source.slice(0,a)+source.slice(b+end.length);
}
export function maskArubaTrashRow(source){
 if(typeof source!=='string')throw TypeError('TrashRow source required');
 const purgeClick='onClick={() => setConfirmPurge(true)}';
 const a=source.indexOf(purgeClick);
 if(a<0)throw Error('TrashRow permanent-delete button changed');
 const tooltipStart=source.lastIndexOf('      <Tooltip>',a);
 const tooltipEnd=source.indexOf('      </Tooltip>',a);
 if(tooltipStart<0||tooltipEnd<0)throw Error('TrashRow purge Tooltip changed');
 let result=source.slice(0,tooltipStart)+source.slice(tooltipEnd+'      </Tooltip>'.length);
 result=removeOnce(result,'      {confirmPurge && (','      )}','TrashRow purge confirm');
 if(result.includes(purgeClick)||result.includes('onPurge();')||
   result.includes('aria-label="Elimina definitivamente"'))
  throw Error('Unsafe permanent-delete command remains in TrashRow');
 return result;
}
export function maskArubaSessionNotesTrashHeader(source){
 if(typeof source!=='string')throw TypeError('Notes panel source required');
 let result=removeOnce(source,
  '                extraAction={\n                  openSections.trash && trash.count > 0 ? (',
  '\n                 }',
  'Original trash header restore-all/empty actions');
 result=result.replace('                onToggle={() => toggleSection(\'trash\')}',
  '                onToggle={() => toggleSection(\'trash\')}\n                extraAction={undefined}');
 if(!result.includes('extraAction={undefined}'))
  throw Error('Original trash header not safely remapped');
 result=removeOnce(result,
  '      {confirmEmptyTrash && (',
  '      )}',
  'Original trash permanent-empty confirmation');
 result=result.replace(
  'oppure usa "Ripristina"/"Elimina definitivamente".',
  'oppure usa "Ripristina".'
 );
 if(result.includes('onClick={trash.restoreAll}')||
  result.includes('onConfirm={() => {\n            setConfirmEmptyTrash(false);')||
  result.includes('onClick={() => setConfirmEmptyTrash(true)}'))
  throw Error('Destructive/global trash controls remain');
 return result;
}
