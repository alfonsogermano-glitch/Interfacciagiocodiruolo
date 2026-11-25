// The authenticated portrait is overlaid for rendering, not stored in sheet JSON.
// Original EntityDetailView spreads that rendered entity into ordinary edits.
export function withoutCharacterPortraitPresentation(next,persisted){
 const result={...next};
 for(const key of ['portraitImageUrl','portraitSourceImageUrl','portraitCropArea']){
  if(Object.hasOwn(persisted,key))result[key]=persisted[key];
  else delete result[key];
 }
 return result;
}
