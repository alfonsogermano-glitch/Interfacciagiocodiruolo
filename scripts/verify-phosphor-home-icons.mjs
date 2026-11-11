import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const home = readFileSync('src/app/home/HomeScreen.tsx','utf8');
const landing = readFileSync('src/app/landing/LandingPage.tsx','utf8');
for(const [name,source] of [['HomeScreen',home],['LandingPage',landing]]) {
 assert.match(source,/from ['"]@iconify\/react['"]/,`${name} must load Phosphor renderer`);
}
for(const icon of ['skull','lightning','scroll','user-circle','door-open']) assert.ok(home.includes('icon="ph:'+icon+'-duotone"'),icon);
for(const icon of ['book-open','users','wifi-high','gear']) assert.ok(landing.includes('icon="ph:'+icon+'-duotone"'),icon);
assert.doesNotMatch(landing,/from ['"]lucide-react['"]/);
assert.ok(home.includes('Loader2'), 'preserve loading animation');
console.log('PASS: Phosphor icons on Home and landing without changing UI flow');
