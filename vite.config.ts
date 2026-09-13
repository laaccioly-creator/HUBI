import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

function setupBuscaFotosMiddleware(middlewares: any) {
  middlewares.use('/api/buscar-fotos-web', async (req: any, res: any) => {
    // Adiciona headers de CORS para permitir acesso seguro a partir de qualquer porta / PWA
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      const urlObj = new URL(req.url || '', 'http://localhost:3000');
      const q = urlObj.searchParams.get('q') || '';
      if (!q.trim()) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ results: [] }));
        return;
      }

      const ddgRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(q.trim())}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      const html = await ddgRes.text();
      const vqdMatch = html.match(/vqd=([0-9-]+)/) || html.match(/vqd=["']([0-9-]+)["']/);
      const vqd = vqdMatch ? vqdMatch[1] : null;

      if (!vqd) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ results: [] }));
        return;
      }

      const iUrl = `https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(q.trim())}&vqd=${vqd}&f=,,,&p=1`;
      const iRes = await fetch(iUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Referer': 'https://duckduckgo.com/'
        }
      });
      const data = await iRes.json();
      const rawList = Array.isArray(data.results) ? data.results : [];
      const results = rawList.slice(0, 24).map((r: any) => ({
        title: r.title || q,
        image: r.image,
        thumbnail: r.thumbnail
      }));

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ results }));
    } catch (err: any) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ results: [], error: err.message }));
    }
  });

  // Middleware proxy para SerpApi (Google Images Engine) em desenvolvimento local
  middlewares.use('/api/buscar-fotos-serpapi', async (req: any, res: any) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      const urlObj = new URL(req.url || '', 'http://localhost:3000');
      const action = urlObj.searchParams.get('action');
      const apiKey = urlObj.searchParams.get('api_key') || '';

      if (action === 'account') {
        if (!apiKey) {
          res.statusCode = 401;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Chave de API não informada' }));
          return;
        }

        const accountRes = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(apiKey)}`);
        const accountData = await accountRes.json().catch(() => ({}));
        res.statusCode = accountRes.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(accountData));
        return;
      }

      const q = urlObj.searchParams.get('q') || '';
      if (!apiKey) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Chave de API SerpApi não informada', error_type: 'auth' }));
        return;
      }

      if (!q.trim()) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ images_results: [] }));
        return;
      }

      const searchParams = new URLSearchParams({
        engine: 'google_images',
        q: q.trim(),
        hl: 'pt',
        gl: 'br',
        api_key: apiKey
      });

      const serpRes = await fetch(`https://serpapi.com/search.json?${searchParams.toString()}`);
      const serpData = await serpRes.json().catch(() => ({}));

      res.statusCode = serpRes.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(serpData));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message, error_type: 'general' }));
    }
  });
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'manifest.json'],
      manifest: {
        name: 'HUBI - Gestão e Vendas',
        short_name: 'HUBI',
        description: 'Sistema completo de gestão e vendas para pequenos lojistas',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone', 'minimal-ui'],
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024
      }
    }),
    {
      name: 'api-busca-fotos-internet',
      configureServer(server) {
        setupBuscaFotosMiddleware(server.middlewares);
      },
      configurePreviewServer(server) {
        setupBuscaFotosMiddleware(server.middlewares);
      }
    }
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 3000,
    host: true
  }
});
