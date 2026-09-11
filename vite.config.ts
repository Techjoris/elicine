import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { pathToFileURL } from 'url'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      {
        name: 'local-api-handlers',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const url = new URL(req.url || '', 'http://localhost');
            const pathname = url.pathname;

            // Helper pour adapter req et res aux handlers Vercel
            const adaptResponse = () => {
              (res as any).status = (code: number) => {
                res.statusCode = code;
                return res;
              };
              (res as any).json = (data: any) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
              };
            };

            const getBody = (): Promise<any> => {
              return new Promise((resolve) => {
                let data = '';
                req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
                req.on('end', () => {
                  try {
                    resolve(data ? JSON.parse(data) : {});
                  } catch {
                    resolve({});
                  }
                });
              });
            };

            // 1. ROUTE /api/ai (et alias /api/groq, /api/recommend)
            if ((pathname === '/api/ai' || pathname === '/api/groq' || pathname === '/api/recommend') && req.method === 'POST') {
              adaptResponse();
              (req as any).body = await getBody();
              try {
                process.env.GROQ_API_KEY = env.GROQ_API_KEY || process.env.GROQ_API_KEY;
                process.env.QWEN_API_KEY = env.QWEN_API_KEY || process.env.QWEN_API_KEY;
                const fileUrl = pathToFileURL(path.resolve('./api/ai.js')).href;
                const aiHandler = (await import(/* @vite-ignore */ fileUrl)).default;
                return await aiHandler(req, res);
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: err.message }));
              }
            }

            // 2. ROUTE /api/tmdb
            if (pathname === '/api/tmdb' && req.method === 'GET') {
              adaptResponse();
              const query: Record<string, string> = {};
              url.searchParams.forEach((v, k) => { query[k] = v; });
              (req as any).query = query;
              try {
                process.env.TMDB_API_KEY = env.TMDB_API_KEY || process.env.TMDB_API_KEY;
                const fileUrl = pathToFileURL(path.resolve('./api/tmdb.js')).href;
                const tmdbHandler = (await import(/* @vite-ignore */ fileUrl)).default;
                return await tmdbHandler(req, res);
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: err.message }));
              }
            }

            // 3. ROUTE /api/saspay (et alias /api/moneroo, /api/notchpay)
            if (
              pathname === '/api/saspay' || 
              pathname === '/api/saspay/verify' || 
              pathname === '/api/saspay/webhook' ||
              pathname === '/api/moneroo' || 
              pathname === '/api/moneroo/verify' || 
              pathname === '/api/notchpay' || 
              pathname === '/api/notchpay/verify'
            ) {
              adaptResponse();
              const query: Record<string, string> = {};
              url.searchParams.forEach((v, k) => { query[k] = v; });
              (req as any).query = query;
              if (req.method === 'POST') {
                (req as any).body = await getBody();
              }
              try {
                process.env.saspay_Backend = env.saspay_Backend || env.SASPAY_BACKEND || env.VITE_SASPAY_BACKEND || process.env.saspay_Backend;
                const fileUrl = pathToFileURL(path.resolve('./api/saspay.js')).href;
                const saspayHandler = (await import(/* @vite-ignore */ fileUrl)).default;
                return await saspayHandler(req, res);
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: err.message }));
              }
            }

            // 4. ROUTE /api/auth (login, register, send-verification, google)
            if (pathname.startsWith('/api/auth')) {
              adaptResponse();
              const query: Record<string, string> = {};
              url.searchParams.forEach((v, k) => { query[k] = v; });
              const subpath = pathname.replace(/^\/api\/auth\/?/, '');
              if (subpath) query.action = subpath;
              (req as any).query = query;
              if (req.method === 'POST') {
                (req as any).body = await getBody();
              }
              try {
                const fileUrl = pathToFileURL(path.resolve('./api/auth.js')).href;
                const authHandler = (await import(/* @vite-ignore */ fileUrl)).default;
                return await authHandler(req, res);
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: err.message }));
              }
            }

            next();
          });
        },
      },
    ],
    server: {
      watch: {
        ignored: ['**/tools/**', '**/android/**'],
      },
    },
    optimizeDeps: {
      entries: ['index.html'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
    },
  };
});
