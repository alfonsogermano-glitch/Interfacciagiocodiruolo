import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const detail=readFileSync(new URL('../src/ArubaNarrativeDetailPanel.tsx',import.meta.url),'utf8');
const original=readFileSync(new URL('../../../src/app/components/session/shared/EntityDetailView.tsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
const media=readFileSync(new URL('../src/ArubaNarrativeImageEditor.tsx',import.meta.url),'utf8');

test('session PNG and monster cards open the original detail with serialized Aruba writes',()=>{
 assert.match(app,/setNarrativeOpenRequest\(\{kind,id,requestId:\+\+requestSequence\.current\}\)/);
 assert.doesNotMatch(app,/setNarrativeOpenRequest[\s\S]{0,160}setSection\(kind\)/);
 assert.match(app,/ArubaNarrativeDetailPanel[\s\S]*requestId=\{narrativeOpenRequest\.requestId\}/);
 assert.match(detail,/listArubaNarrativeContent/);
 assert.match(detail,/EntityDetailView entityType=\{kind==='npcs'\?'npc':'monster'\}/);
 assert.match(detail,/saveArubaNarrativeContent/);
 assert.match(detail,/saveQueue\.current=saveQueue\.current/);
 assert.match(detail,/if\(saveError\.current!==null\)return/);
 assert.match(detail,/awaitArubaNoteWrites\(campaignId,entityId\)/);
 assert.match(detail,/onUpdate=\{updateItem\} canEdit/);
 assert.match(detail,/arubaReadOnlyMedia arubaIsolatedNarrative/);
 assert.match(original,/enabled: true/);
 assert.match(detail,/ArubaNarrativeNotesProvider enabled=\{notesEnabled\}/);
 assert.match(original,/if \(arubaIsolatedNarrative\) \{[\s\S]{0,160}setCampaignChapters\(arubaNarrativeChapters/);
 assert.match(original,/if \(!campaignId \|\| \(entityType !== 'npc' && entityType !== 'monster'\)\)/);
});

test('narrative media reuses original crop and frame UI through authenticated Aruba assets',()=>{
 assert.match(app,/visualAssetsEnabled=\{user\.visualAssetsEnabled\}/);
 assert.match(detail,/visualAssetsEnabled\?<ArubaNarrativeImageEditor/);
 assert.match(detail,/Asset grafici Aruba non abilitati/);
 assert.match(media,/ImageCropCore/);
 assert.match(media,/EntityImageExtras/);
 assert.match(media,/visualAssetsStorage\.upsert/);
 assert.match(media,/portraitSourceImageUrl:saved\.imageDataUrl/);
 assert.match(media,/portraitAssetId:id,portraitImageUrl:saved\.imageDataUrl/);
 assert.match(media,/if\(!DATA_IMAGE\.test\(cover\)\)\{onUpdate\(next\);return;\}/);
 assert.doesNotMatch(media,/supabase|localStorage/i);
});
