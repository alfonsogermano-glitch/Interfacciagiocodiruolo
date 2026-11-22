// Objective comparison for the existing original/Aruba screenshot pairs.
// It uses Chromium's own canvas decoder, so no new image dependency (sharp,
// pngjs, pixelmatch, ...) enters the repository. This runner never approves or
// reviews a layout: approved/layoutDiffReviewed stay false in every manifest and
// in the emitted report. Human visual review remains a separate gate.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const here=path.dirname(fileURLToPath(import.meta.url));
const output=path.resolve(process.env.HG_VISUAL_DIFF_OUTPUT??path.join(here,'../../../deploy/aruba/qa/visual-comparison'));
const manifests=['manifest.json','manifest-campaigns.json','manifest-campaignhome.json'];
const geometryFiles=['geometry-390x844.json','geometry-1440x900.json'];
const VIEWPORTS=new Set(['360x800','390x844','768x1024','1280x720','1440x900','1920x1080']);
const KINDS=new Set(['baseline','aruba']);
const THRESHOLD=16;
const localChromium=path.join(process.env.LOCALAPPDATA??'','ms-playwright','chromium-1228','chrome-win64','chrome.exe');
const executablePath=process.env.HG_CHROMIUM_PATH??(existsSync(localChromium)?localChromium:undefined);
const sha256=value=>createHash('sha256').update(value).digest('hex');

function assertManifest(manifest,file){
  assert.equal(manifest.approved,false,`${file} must not claim visual approval`);
  assert.equal(manifest.layoutDiffReviewed,false,`${file} must not claim layout review`);
  assert.ok(Array.isArray(manifest.records),`${file} records missing`);
  const seen=new Set();
  for(const record of manifest.records){
    assert.ok(KINDS.has(record.kind),`${file} invalid record kind`);
    const viewport=`${record.width}x${record.height}`;
    assert.ok(VIEWPORTS.has(viewport),`${file} unexpected viewport ${viewport}`);
    const key=`${record.kind}:${viewport}`;
    assert.equal(seen.has(key),false,`${file} duplicate ${key}`);
    seen.add(key);
  }
  assert.equal(seen.size,12,`${file} must contain six baseline/Aruba pairs`);
}

function pairRecords(manifest,file){
  const pairs=[];
  for(const width of [360,390,768,1280,1440,1920]){
    const recordFor=kind=>manifest.records.find(record=>record.kind===kind&&record.width===width);
    const baseline=recordFor('baseline'),aruba=recordFor('aruba');
    assert.ok(baseline,`${file} missing baseline ${width}`);
    assert.ok(aruba,`${file} missing Aruba ${width}`);
    pairs.push({viewport:`${width}x${baseline.height}`,baseline,aruba});
  }
  return pairs;
}

function diffObjects(a,b,tolerance=0.5){
  const changed=[],numeric=[];
  const walk=(left,right,key)=>{
    if(typeof left==='number'&&typeof right==='number'){
      const delta=right-left,abs=Math.abs(delta);
      numeric.push({field:key,baseline:left,aruba:right,delta,maxAbsoluteDelta:abs});
      if(abs>tolerance)changed.push({field:key,baseline:left,aruba:right,delta,absDelta:abs});
      return;
    }
    if(Array.isArray(left)||Array.isArray(right)){
      if(!Array.isArray(left)||!Array.isArray(right)||left.length!==right.length){
        changed.push({field:key,baseline:left,aruba:right,reason:'array length/type'});
        return;
      }
      left.forEach((value,index)=>walk(value,right[index],`${key}[${index}]`));
      return;
    }
    if(left&&right&&typeof left==='object'&&typeof right==='object'){
      const keys=[...new Set([...Object.keys(left),...Object.keys(right)])].sort();
      for(const child of keys)walk(left[child],right[child],key?`${key}.${child}`:child);
      return;
    }
    if(left!==right)changed.push({field:key,baseline:left,aruba:right,reason:'value'});
  };
  walk(a,b,'');
  return {
    identical:changed.length===0,
    maxAbsoluteDelta:numeric.reduce((max,row)=>Math.max(max,row.maxAbsoluteDelta),0),
    numericFields:numeric.length,
    changedFields:changed,
  };
}

async function pixelDiff(page,baselineBase64,arubaBase64){
  return page.evaluate(async ({baselineBase64,arubaBase64,threshold})=>{
    const load=source=>new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(new Error('Immagine non decodificabile'));
      image.src='data:image/png;base64,'+source;
    });
    const [baseline,aruba]=await Promise.all([load(baselineBase64),load(arubaBase64)]);
    const width=Math.max(baseline.naturalWidth,aruba.naturalWidth);
    const height=Math.max(baseline.naturalHeight,aruba.naturalHeight);
    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    context.clearRect(0,0,width,height);
    context.drawImage(baseline,0,0);
    const left=context.getImageData(0,0,width,height).data;
    context.clearRect(0,0,width,height);
    context.drawImage(aruba,0,0);
    const right=context.getImageData(0,0,width,height).data;
    const output=context.createImageData(width,height);
    const pixels=width*height;
    let exact=0,perceptible=0,strong=0;
    let sum=0,sumSquared=0,sumAlpha=0;
    let minX=width,minY=height,maxX=-1,maxY=-1;
    for(let offset=0;offset<pixels*4;offset+=4){
      const dr=Math.abs(left[offset]-right[offset]);
      const dg=Math.abs(left[offset+1]-right[offset+1]);
      const db=Math.abs(left[offset+2]-right[offset+2]);
      const da=Math.abs(left[offset+3]-right[offset+3]);
      const delta=Math.max(dr,dg,db,da);
      if(delta>0)exact++;
      if(delta>threshold)perceptible++;
      if(delta>64)strong++;
      sum+=dr+dg+db;
      sumSquared+=dr*dr+dg*dg+db*db;
      sumAlpha+=da;
      const pixel=offset/4,x=pixel%width,y=Math.floor(pixel/width);
      if(delta>threshold){
        if(x<minX)minX=x;if(y<minY)minY=y;
        if(x>maxX)maxX=x;if(y>maxY)maxY=y;
      }
      const heat=Math.min(255,Math.round(delta*3));
      output.data[offset]=heat;
      output.data[offset+1]=delta>threshold?0:32;
      output.data[offset+2]=delta>threshold?0:40;
      output.data[offset+3]=255;
    }
    const diffCanvas=document.createElement('canvas');
    diffCanvas.width=width;diffCanvas.height=height;
    diffCanvas.getContext('2d').putImageData(output,0,0);
    const rgb=pixels*3;
    return {
      canvas:{width,height},
      baseline:{width:baseline.naturalWidth,height:baseline.naturalHeight},
      aruba:{width:aruba.naturalWidth,height:aruba.naturalHeight},
      missingPixels:width*height-Math.min(baseline.naturalWidth,aruba.naturalWidth)*Math.min(baseline.naturalHeight,aruba.naturalHeight),
      exactDifferingPixels:exact,
      perceptiblePixels:perceptible,
      strongPixels:strong,
      perceptibleRatio:perceptible/pixels,
      meanAbsoluteError:sum/rgb,
      rootMeanSquareError:Math.sqrt(sumSquared/rgb),
      meanAlphaDelta:sumAlpha/pixels,
      perceptibleBounds:maxX<0?null:{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1},
      diffDataUrl:diffCanvas.toDataURL('image/png'),
    };
  },{baselineBase64,arubaBase64,threshold:THRESHOLD});
}

await mkdir(path.join(output,'diffs'),{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions','--no-first-run'],...(executablePath?{executablePath}:{})});
const page=await browser.newPage();
const surfaces=[],geometry=[];
try{
  for(const manifestFile of manifests){
    const manifestPath=path.join(output,manifestFile);
    assert.ok(existsSync(manifestPath),`Manifest mancante: ${manifestFile}`);
    const manifest=JSON.parse((await readFile(manifestPath,'utf8')).replace(/^\uFEFF/,''));
    assertManifest(manifest,manifestFile);
    const surface=manifest.fixtureState?.surface??path.basename(manifestFile,'.json');
    const pairs=[];
    for(const pair of pairRecords(manifest,manifestFile)){
      const baselineBytes=await readFile(path.join(output,pair.baseline.file));
      const arubaBytes=await readFile(path.join(output,pair.aruba.file));
      assert.equal(sha256(baselineBytes),pair.baseline.sha256,`${pair.baseline.file} hash changed`);
      assert.equal(sha256(arubaBytes),pair.aruba.sha256,`${pair.aruba.file} hash changed`);
      const metrics=await pixelDiff(page,baselineBytes.toString('base64'),arubaBytes.toString('base64'));
      const diffName=`${surface}-${pair.viewport}-diff.png`;
      await writeFile(path.join(output,'diffs',diffName),Buffer.from(metrics.diffDataUrl.split(',')[1],'base64'));
      delete metrics.diffDataUrl;
      const geometryComparison=pair.baseline.geometry&&pair.aruba.geometry
        ?diffObjects(pair.baseline.geometry,pair.aruba.geometry)
        :null;
      pairs.push({
        viewport:pair.viewport,
        baseline:{file:pair.baseline.file,sha256:pair.baseline.sha256,...metrics.baseline},
        aruba:{file:pair.aruba.file,sha256:pair.aruba.sha256,...metrics.aruba},
        metrics:{...metrics,diffFile:'diffs/'+diffName},
        geometry:geometryComparison,
      });
    }
    surfaces.push({surface,manifest:manifestFile,generatedAt:manifest.generatedAt,pairs});
  }

  for(const file of geometryFiles){
    const absolute=path.join(output,file);
    if(!existsSync(absolute))continue;
    const document=JSON.parse((await readFile(absolute,'utf8')).replace(/^\uFEFF/,''));
    assert.ok(document.results?.baseline&&document.results?.aruba,`${file} incomplete`);
    geometry.push({file,viewport:document.viewport,comparison:diffObjects(document.results.baseline,document.results.aruba)});
  }
}finally{
  await page.close().catch(()=>{});
  await browser.close().catch(()=>{});
}

const totals=surfaces.flatMap(surface=>surface.pairs.map(pair=>({
  surface:surface.surface,...pair.metrics,
})));
const report={
  schemaVersion:1,
  generatedAt:new Date().toISOString(),
  runner:'apps/aruba-vtt-pilot/test/compare-visual-baseline.mjs',
  method:'Chromium canvas getImageData; pixel and geometry metrics computed from the checked-in pairs',
  thresholds:{perceptibleChannelDelta:THRESHOLD,strongChannelDelta:64,geometryTolerancePx:0.5},
  approval:{
    approved:false,
    layoutDiffReviewed:false,
    note:'Metriche oggettive, non approvazione. La revisione visuale umana e le variazioni deliberate (palette nero/oro, icone Phosphor Duotone) restano un gate separato.',
  },
  summary:{
    surfaces:surfaces.length,
    pairs:totals.length,
    perceptiblePixels:totals.reduce((sum,row)=>sum+row.perceptiblePixels,0),
    meanAbsoluteError:totals.reduce((sum,row)=>sum+row.meanAbsoluteError,0)/Math.max(totals.length,1),
    maxMeanAbsoluteError:Math.max(...totals.map(row=>row.meanAbsoluteError)),
    geometryFiles:geometry.length,
    geometryChangedFields:geometry.reduce((sum,row)=>sum+row.comparison.changedFields.length,0),
  },
  surfaces,
  geometry,
};
await mkdir(path.join(output,'diffs'),{recursive:true});
await writeFile(path.join(output,'visual-diff.json'),JSON.stringify(report,null,2)+'\n');

const rows=surfaces.flatMap(surface=>surface.pairs.map(pair=>{
  const geometry=pair.geometry?`${pair.geometry.maxAbsoluteDelta.toFixed(2)} px / ${pair.geometry.changedFields.length} campi`:'n/d';
  return `| ${surface.surface} | ${pair.viewport} | ${pair.metrics.canvas.width}×${pair.metrics.canvas.height} | ${(pair.metrics.perceptibleRatio*100).toFixed(2)}% | ${pair.metrics.meanAbsoluteError.toFixed(2)} | ${pair.metrics.rootMeanSquareError.toFixed(2)} | ${pair.metrics.perceptibleBounds?`${pair.metrics.perceptibleBounds.width}×${pair.metrics.perceptibleBounds.height}`:'—'} | ${geometry} |`;
})).join('\n');
const geometryRows=geometry.map(row=>`| ${row.file} | ${row.viewport} | ${row.comparison.maxAbsoluteDelta.toFixed(2)} px | ${row.comparison.changedFields.length} | ${row.comparison.changedFields.slice(0,6).map(field=>field.field).join(', ')||'—'} |`).join('\n');
const markdown=`# Diff visuale originale / Aruba

Generato da \`compare-visual-baseline.mjs\` con Chromium canvas. **Non è una approvazione**: \`approved\` e \`layoutDiffReviewed\` restano \`false\`.

- Superfici: ${report.summary.surfaces}
- Coppie: ${report.summary.pairs}
- MAE massimo: ${report.summary.maxMeanAbsoluteError.toFixed(2)} / 255
- File geometria confrontati: ${report.summary.geometryFiles}
- Campi geometria oltre 0,5 px: ${report.summary.geometryChangedFields}

Le variazioni deliberate note (palette nero/oro, icone Phosphor Duotone) non vengono compensate né approvate automaticamente. Le immagini heatmap sono in \`diffs/\`.

## Pixel

| Superficie | Viewport | Canvas | Pixel percepibili | MAE | RMSE | Bounding box diff | Geometria (max / campi) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

## Geometria home

| File | Viewport | Delta massimo | Campi cambiati | Primi campi |
| --- | --- | ---: | ---: | --- |
${geometryRows||'| — | — | — | — | — |'}

## Esito

Il diff misura le differenze ma non le certifica come accettabili. Per promuovere \`originalAndArubaVisualDiff\` serve ancora una revisione visuale registrata, con accettazione esplicita delle variazioni deliberate e dei residui di layout.
`;
await writeFile(path.join(output,'visual-diff.md'),markdown);
console.log(`VISUAL_DIFF_COMPUTED: ${report.summary.pairs} pairs, ${report.summary.geometryFiles} geometry files, approved=false, layoutDiffReviewed=false.`);
console.log(`Report: ${path.join(output,'visual-diff.json')}`);
