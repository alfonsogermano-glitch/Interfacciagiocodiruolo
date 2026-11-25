// TEST ONLY. Render the actual original panel with isolated read-only fixtures.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {SessionCharactersPanel} from '../../../src/app/components/session/SessionCharactersPanel';
import {SlideOverPanel} from '../../../src/app/components/session/SlideOverPanel';
import '../../../src/styles/index.css';
createRoot(document.getElementById('root')!).render(
 <div className="workspace" data-dashboard-palette="sepia">
  <main className="content">
   <SlideOverPanel isOpen onClose={()=>{}} panelWidth={1024} widthClassName="max-w-none">
    <div data-original-sheet-reference className="h-full"><SessionCharactersPanel/></div>
   </SlideOverPanel>
  </main>
 </div>);
