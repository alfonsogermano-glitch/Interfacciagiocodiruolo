// Bounded PNG data-URL encoding for Aruba image transports. The original
// sources are resized (never enlarged) and converted to PNG before they reach
// the Aruba visual-asset store: source and thumbnail are persisted separately
// and the API enforces its own limits.
export async function imageBlobToPngDataUrl(blob:Blob,size:number):Promise<string>{
 const url=URL.createObjectURL(blob);
 const image=new Image();
 const done=(callback:()=>void)=>{URL.revokeObjectURL(url);callback();};
 await new Promise<void>((resolve,reject)=>{
  image.onload=()=>resolve();
  image.onerror=()=>reject(new Error('Immagine non leggibile'));
  image.src=url;
 });
 try{
  const scale=Math.min(1,size/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const context=canvas.getContext('2d');
  if(!context)throw new Error('Canvas non disponibile');
  context.drawImage(image,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/png');
 }finally{done(()=>{})}
}
