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
                process.env.DASHSCOPE_API_KEY = env.DASHSCOPE_API_KEY || env.VITE_DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY;
                process.env.DEEPSEEK_API_KEY = env.DEEPSEEK_API_KEY || env.VITE_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;
                const fileUrl = pathToFileURL(path.resolve('./api/ai.js')).href;
                const aiHandler = (await import(/* @vite-ignore */ fileUrl)).default;
                return await aiHandler(req, res);
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: err.message }));
              }
            }

            // 1.5 ROUTE /api/search
            if (pathname === '/api/search') {
              adaptResponse();
              const query: Record<string, string> = {};
              url.searchParams.forEach((v, k) => { query[k] = v; });
              (req as any).query = query;
              if (req.method === 'POST') {
                (req as any).body = await getBody();
              }
              try {
                process.env.TMDB_API_KEY = env.TMDB_API_KEY || env.VITE_TMDB_API_KEY || process.env.TMDB_API_KEY;
                process.env.GROQ_API_KEY = env.GROQ_API_KEY || env.AI_API_KEY || process.env.GROQ_API_KEY;
                process.env.QWEN_API_KEY = env.QWEN_API_KEY || process.env.QWEN_API_KEY;
                process.env.DASHSCOPE_API_KEY = env.DASHSCOPE_API_KEY || env.VITE_DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY;
                process.env.DEEPSEEK_API_KEY = env.DEEPSEEK_API_KEY || env.VITE_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;
                process.env.GEMINI_API_KEY = env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
                process.env.SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
                process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
                const fileUrl = pathToFileURL(path.resolve('./api/search.js')).href;
                const searchHandler = (await import(/* @vite-ignore */ fileUrl)).default;
                return await searchHandler(req, res);
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: err.message }));
              }
            }

            // 2. ROUTE /api/tmdb (redirigé vers api/search.js?action=tmdb)
            if (pathname === '/api/tmdb' && req.method === 'GET') {
              adaptResponse();
              const query: Record<string, string> = {};
              url.searchParams.forEach((v, k) => { query[k] = v; });
              query.action = 'tmdb';
              (req as any).query = query;
              try {
                process.env.TMDB_API_KEY = env.TMDB_API_KEY || process.env.TMDB_API_KEY;
                const fileUrl = pathToFileURL(path.resolve('./api/search.js')).href;
                const searchHandler = (await import(/* @vite-ignore */ fileUrl)).default;
                return await searchHandler(req, res);
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: err.message }));
              }
            }

            // 3. ROUTE /api/saspay (et alias /api/moneroo, /api/notchpay, /api/webhook)
            if (
              pathname === '/api/saspay' || 
              pathname === '/api/saspay/verify' || 
              pathname === '/api/saspay/webhook' ||
              pathname === '/api/webhook' ||
              pathname === '/api/moneroo' || 
              pathname === '/api/moneroo/verify' || 
              pathname === '/api/notchpay' || 
              pathname === '/api/notchpay/verify'
            ) {
              adaptResponse();
              const query: Record<string, string> = {};
              url.searchParams.forEach((v, k) => { query[k] = v; });
              if (pathname.includes('webhook')) query.action = 'webhook';
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

            // 3.5. ROUTE /api/paddle-webhook (et alias /api/paddle/webhook)
            if (pathname === '/api/paddle-webhook' || pathname === '/api/paddle/webhook') {
              adaptResponse();
              if (req.method === 'POST') {
                (req as any).body = await getBody();
              }
              try {
                process.env.RESEND_API_KEY = env.RESEND_API_KEY || process.env.RESEND_API_KEY;
                process.env.PADDLE_WEBHOOK_SECRET_KEY = env.PADDLE_WEBHOOK_SECRET_KEY || process.env.PADDLE_WEBHOOK_SECRET_KEY;
                process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
                process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
                const module = await server.ssrLoadModule('./api/paddle-webhook.ts');
                const paddleHandler = module.default;
                return await paddleHandler(req, res);
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: err.message }));
              }
            }

            // 3.6. ROUTE /api/admin & /api/feedback
            if (pathname.startsWith('/api/admin') || pathname === '/api/feedback') {
              adaptResponse();
              const query: Record<string, string> = {};
              url.searchParams.forEach((v, k) => { query[k] = v; });
              if (pathname.includes('feedback')) query.action = 'feedback';
              else if (pathname.includes('users')) query.action = 'users';
              (req as any).query = query;
              if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE') {
                (req as any).body = await getBody();
              }
              try {
                const fileUrl = pathToFileURL(path.resolve('./api/admin.js')).href;
                const adminHandler = (await import(/* @vite-ignore */ fileUrl)).default;
                return await adminHandler(req, res);
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: err.message }));
              }
            }

            // 3.7. ROUTE /api/activate-pro & /api/movie-alerts
            if (pathname === '/api/activate-pro' || pathname === '/api/movie-alerts' || pathname === '/api/send-thank-you-email') {
              adaptResponse();
              const query: Record<string, string> = {};
              url.searchParams.forEach((v, k) => { query[k] = v; });
              if (pathname === '/api/movie-alerts') query.action = 'movie-alerts';
              if (pathname === '/api/send-thank-you-email') query.action = 'thank-you-email';
              (req as any).query = query;
              if (req.method === 'POST' || req.method === 'DELETE') {
                (req as any).body = await getBody();
              }
              try {
                const fileUrl = pathToFileURL(path.resolve('./api/activate-pro.js')).href;
                const activateHandler = (await import(/* @vite-ignore */ fileUrl)).default;
                return await activateHandler(req, res);
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

            // 5. ROUTE /api/geo
            if (pathname === '/api/geo') {
              adaptResponse();
              const country =
                req.headers['x-vercel-ip-country'] ||
                req.headers['cf-ipcountry'] ||
                req.headers['x-country-code'] ||
                null;
              const countryCode = country ? String(country).toUpperCase().trim() : null;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({
                countryCode,
                country: countryCode,
                source: countryCode ? 'vercel-header' : 'none'
              }));
            }

            next();
          });
        },
      },
    ],
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
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
