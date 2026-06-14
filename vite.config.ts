import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import type { ViteDevServer } from 'vite'

const pendingRequests = new Map<string, { res: any; format: string; timeoutId: NodeJS.Timeout }>();

const agentApiPlugin = () => ({
  name: 'agent-api-plugin',
  configureServer(server: ViteDevServer) {
    server.ws.on('agent-response', (data: any) => {
      const { requestId, success, payload, error } = data;
      const pending = pendingRequests.get(requestId);
      if (pending) {
        const { res, format, timeoutId } = pending;
        clearTimeout(timeoutId);
        pendingRequests.delete(requestId);
        
        if (!success) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error }));
          return;
        }

        if (format === 'markdown') {
          res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
          res.end(payload.markdown || payload);
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload.json || payload));
        }
      }
    });

    server.middlewares.use((req, res, next) => {
      const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
      if (urlObj.pathname.startsWith('/api/')) {
        const format = urlObj.searchParams.get('format') === 'markdown' || req.headers.accept?.includes('text/markdown') ? 'markdown' : 'json';
        const requestId = Math.random().toString(36).substring(2, 11);

        const timeoutId = setTimeout(() => {
          if (pendingRequests.has(requestId)) {
            pendingRequests.delete(requestId);
            res.writeHead(504, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Gateway Timeout. No active browser tab responded. Please make sure the Zen-Tabo frontend tab is open in your browser.' }));
          }
        }, 5000);

        pendingRequests.set(requestId, { res, format, timeoutId });

        let bodyStr = '';
        req.on('data', chunk => { bodyStr += chunk; });
        req.on('end', () => {
          let bodyPayload = {};
          try {
            if (bodyStr) {
              bodyPayload = JSON.parse(bodyStr);
            }
          } catch (e) {}

          server.ws.send('agent-request', {
            requestId,
            url: urlObj.pathname,
            query: Object.fromEntries(urlObj.searchParams.entries()),
            body: bodyPayload
          });
        });
      } else {
        next();
      }
    });
  }
});

export default defineConfig({
  plugins: [solid(), agentApiPlugin()],
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
