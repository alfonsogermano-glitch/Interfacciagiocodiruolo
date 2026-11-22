import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.HG_ORIGINAL_BASELINE_URL??'http://127.0.0.1:4174';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-extensions','--disable-component-extensions-with-background-pages'],...(process.env.HG_BROWSER_EXECUTABLE?{executablePath:process.env.HG_BROWSER_EXECUTABLE}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[],external=[];let extensionRequests=0;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===new URL(base).origin)return route.continue();if(url.hostname==='filtering.adblock360.com'){extensionRequests++;return route.abort('blockedbyclient');}if(url.hostname==='fonts.googleapis.com')return route.fulfill({status:200,contentType:'text/css',body:''});if(url.hostname.endsWith('.supabase.co')&&url.pathname.endsWith('/notifications'))return route.fulfill({status:200,contentType:'application/json',body:'{"notifications":[]}'});external.push(url.href);return route.abort('blockedbyclient');});
 await page.goto(base+'/?online=1',{waitUntil:'networkidle'});
 await page.getByText('Campagna browser',{exact:true}).first().waitFor();
 assert.equal(await page.getByText('GM prova',{exact:false}).first().isVisible(),true);
 assert.deepEqual(external,[],'The controlled original baseline attempted external network access');
 assert.deepEqual(errors.filter(message=>!(extensionRequests&&message==='Failed to fetch')),[]);
 console.log('Original visual baseline fixture smoke passed without external network access.');
}finally{await browser.close();}
