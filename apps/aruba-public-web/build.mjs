// Static render of the actual original React pages. No auth, API, browser JS,
// database or Supabase client is imported or contacted by these public pages.
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer,build as viteBuild} from 'vite';
import tailwindcss from '@tailwindcss/vite';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export async function buildPublicPages(output=resolve(root,'deploy/aruba/dist/public-pages')){
  // The original components also depend on the original global Preflight and
  // typography. Reuse their actual CSS build, not browser default margins or a
  // hand-written approximation of the old page's geometry.
  const styleBuild=await viteBuild({root,configFile:false,logLevel:'error',plugins:[tailwindcss()],
    build:{write:false,rollupOptions:{input:resolve(root,'src/styles/index.css')}}});
  const assets=(Array.isArray(styleBuild)?styleBuild:[styleBuild]).flatMap(item=>item.output);
  const styles=assets.filter(item=>item.type==='asset'&&item.fileName.endsWith('.css'));
  if(styles.length!==1||assets.some(item=>item.type==='asset'&&!item.fileName.endsWith('.css')))
    throw new Error('Original legal CSS has unexpected external assets; review before publishing');
  const css=String(styles[0].source);
  if(/<\/style/i.test(css))throw new Error('Unsafe inline stylesheet boundary');
  const server=await createServer({root,configFile:false,appType:'custom',logLevel:'error',
    esbuild:{jsx:'automatic'},optimizeDeps:{noDiscovery:true,include:[]},
    server:{middlewareMode:true,hmr:false,watch:null}});
  try{
    const {PrivacyPolicy}=await server.ssrLoadModule('/src/app/legal/PrivacyPolicy.tsx');
    const {DeleteData}=await server.ssrLoadModule('/src/app/legal/DeleteData.tsx');
    const pages=[
      {path:'/privacy',title:'Informativa sulla Privacy',source:'src/app/legal/PrivacyPolicy.tsx',
        element:createElement(PrivacyPolicy,{storageProvider:'Aruba (database PostgreSQL)',socialProviders:'Google o Discord',updatedAt:'novembre 2026'})},
      {path:'/elimina-dati',title:'Elimina i tuoi dati',source:'src/app/legal/DeleteData.tsx',element:createElement(DeleteData)},
    ];
    await mkdir(output,{recursive:true});
    const styleSources=[];
    for(const path of ['src/styles/index.css','src/styles/fonts.css','src/styles/tailwind.css','src/styles/theme.css'])
      styleSources.push({source:path,sha256:createHash('sha256').update(await readFile(resolve(root,path))).digest('hex')});
    const manifest={schemaVersion:1,originalStyles:{sha256:createHash('sha256').update(css).digest('hex'),sources:styleSources},pages:[]};
    for(const page of pages){
      const body=renderToStaticMarkup(page.element);
      // Only static original React markup; links work without JavaScript.
      const html='<!doctype html>\n<html lang="it"><head><meta charset="utf-8">'+
        '<meta name="viewport" content="width=device-width, initial-scale=1">'+
        '<title>'+page.title+' · Hollowgate</title>'+
        '<meta name="referrer" content="strict-origin-when-cross-origin">'+
        '<style>'+css+'</style>'+
        '</head><body>'+body+'</body></html>\n';
      const file=page.path.slice(1)+'.html';
      await writeFile(resolve(output,file),html,'utf8');
      manifest.pages.push({path:page.path,file,source:page.source,
        sourceSha256:createHash('sha256').update(await readFile(resolve(root,page.source))).digest('hex'),
        sha256:createHash('sha256').update(html).digest('hex')});
    }
    await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
    return manifest;
  }finally{await server.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const manifest=await buildPublicPages();
  console.log('ARUBA_ORIGINAL_PUBLIC_PAGES_BUILT: '+manifest.pages.map(page=>page.path).join(', '));
}
