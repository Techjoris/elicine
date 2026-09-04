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

            // 1. ROUTE /api/ai ET /api/groq
            if ((pathname === '/api/ai' || pathname === '/api/groq') && req.method === 'POST') {
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

            // 3. ROUTE /api/notchpay
            if (pathname === '/api/notchpay') {
              adaptResponse();
              const query: Record<string, string> = {};
              url.searchParams.forEach((v, k) => { query[k] = v; });
              (req as any).query = query;
              if (req.method === 'POST') {
                (req as any).body = await getBody();
              }
              try {
                process.env.NOTCHPAY_SECRET_KEY = env.NOTCHPAY_SECRET_KEY || process.env.NOTCHPAY_SECRET_KEY;
                process.env.NOTCHPAY_PRIVATE_KEY = env.NOTCHPAY_PRIVATE_KEY || process.env.NOTCHPAY_PRIVATE_KEY;
                process.env.NOTCHPAY_PUBLIC_KEY = env.NOTCHPAY_PUBLIC_KEY || process.env.NOTCHPAY_PUBLIC_KEY;
                process.env.NOTCHPAY_HASH_KEY = env.NOTCHPAY_HASH_KEY || process.env.NOTCHPAY_HASH_KEY;
                process.env.VITE_NOTCHPAY_PUBLIC_KEY = env.VITE_NOTCHPAY_PUBLIC_KEY || process.env.VITE_NOTCHPAY_PUBLIC_KEY;
                const fileUrl = pathToFileURL(path.resolve('./api/notchpay.js')).href;
                const notchHandler = (await import(/* @vite-ignore */ fileUrl)).default;
                return await notchHandler(req, res);
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
    },
  };
});
