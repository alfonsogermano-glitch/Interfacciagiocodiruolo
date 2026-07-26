import { defineConfig } from 'vite'
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react({
      babel: {
        // MonsterCatalogComponents.tsx contains large base64 image data (6.6MB).
        // compact:false prevents the Babel 500KB code-gen deopt error for that file.
        compact: false,
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory without using Node path/process types
      '@': new URL('./src', import.meta.url).pathname,
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // TEMPORANEO - solo per diagnosticare il crash "Cannot read properties of
  // undefined (reading 'level')" nell'editor con comandi slash: senza
  // sourcemap, lo stack trace nella build di produzione punta a posizioni
  // nel bundle minificato, illeggibili. Da rimuovere non appena la causa e'
  // stata individuata (vedi il commit dedicato che introduce questa riga).
  build: {
    sourcemap: true,
  },
});
