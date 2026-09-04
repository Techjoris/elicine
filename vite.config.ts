import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

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
            if (req.url?.startsWith('/api/groq') && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
              req.on('end', async () => {
                const apiKey = env.GROQ_API_KEY || env.VITE_GROQ_API_KEY || process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
                if (!apiKey) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Clé serveur GROQ manquante' }));
                  return;
                }

                try {
                  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${apiKey}`,
                    },
                    body,
                  });
                  const data = await groqRes.text();
                  res.statusCode = groqRes.status;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(data);
                } catch (err: any) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
              return;
            }

            if (req.url?.startsWith('/api/tmdb')) {
              const urlObj = new URL(req.url, 'http://localhost');
              const endpoint = urlObj.searchParams.get('endpoint');
              const apiKey = urlObj.searchParams.get('api_key') || env.TMDB_API_KEY || env.VITE_TMDB_API_KEY || process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;

              if (!apiKey) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Clé serveur TMDB manquante' }));
                return;
              }

              if (!endpoint) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Paramètre endpoint manquant' }));
                return;
              }

              urlObj.searchParams.delete('endpoint');
              urlObj.searchParams.set('api_key', apiKey);
              if (!urlObj.searchParams.has('language')) {
                urlObj.searchParams.set('language', 'fr-FR');
              }

              try {
                const tmdbUrl = `https://api.themoviedb.org/3/${endpoint}?${urlObj.searchParams.toString()}`;
                const tmdbRes = await fetch(tmdbUrl);
                const data = await tmdbRes.text();
                res.statusCode = tmdbRes.status;
                res.setHeader('Content-Type', 'application/json');
                res.end(data);
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
              return;
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

