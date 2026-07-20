import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import http from 'http'
import zlib from 'zlib'
import path from 'path';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const storybookTarget = env.VITE_STORYBOOK_TARGET || process.env.VITE_STORYBOOK_TARGET || 'http://localhost:6006'
  const recurPublishableKey =
    process.env.VITE_RECUR_PUBLISHABLE_KEY ||
    process.env.RECUR_PUBLISHABLE_KEY ||
    env.VITE_RECUR_PUBLISHABLE_KEY ||
    env.RECUR_PUBLISHABLE_KEY ||
    ''

  return {
    plugins: [
      react(),
      {
        name: 'storybook-trailing-slash-redirect',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === '/dev/storybook') {
              res.statusCode = 302
              res.setHeader('Location', '/dev/storybook/')
              res.end()
              return
            }
            next()
          })
        },
      },
      {
        // Proxy Storybook-specific absolute paths that bypass /dev/storybook prefix.
        // These are paths that Storybook's Vite generates in JS modules.
        name: 'storybook-absolute-paths-proxy',
        configureServer(server) {
          const sbUrl = new URL(storybookTarget)

          function proxyToStorybook(req: http.IncomingMessage, res: http.ServerResponse) {
            const proxyReq = http.request(
              {
                hostname: sbUrl.hostname,
                port: sbUrl.port,
                path: req.url,
                method: req.method,
                headers: { ...req.headers, host: `${sbUrl.hostname}:${sbUrl.port}` },
              },
              (proxyRes) => {
                res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
                proxyRes.pipe(res)
              },
            )
            req.pipe(proxyReq)
            proxyReq.on('error', () => {
              res.statusCode = 502
              res.end('Storybook proxy error')
            })
          }

          server.middlewares.use((req, res, next) => {
            const url = req.url || ''
            // Storybook pre-bundled deps — unique path, won't conflict with frontend
            if (url.includes('/node_modules/.cache/storybook/')) {
              return proxyToStorybook(req, res)
            }
            // Storybook config files — fallback if path rewrite in proxy was missed
            if (url.startsWith('/.storybook/')) {
              return proxyToStorybook(req, res)
            }
            next()
          })
        },
      },
    ],
    define: {
      // Forward VITE_ env vars from Docker env_file into import.meta.env
      // (Vite only reads .env files by default, not process.env)
      ...(recurPublishableKey && {
        'import.meta.env.VITE_RECUR_PUBLISHABLE_KEY': JSON.stringify(recurPublishableKey),
      }),
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
        }
      }
    },
    server: {
      host: true, // Listen on all addresses
      allowedHosts: ['localhost', '127.0.0.1', '0.0.0.0', 'q-judge.quan.wtf', 'q-judge-dev.quan.wtf'],
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
        '/.well-known': {
          target: env.VITE_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
        '^/o/': {
          target: env.VITE_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
        '/django-admin': {
          target: env.VITE_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
        '/admin': {
          target: env.VITE_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
        '/static': {
          target: env.VITE_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
        '/media': {
          target: env.VITE_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
        // Proxy Storybook dev server.
        // selfHandleResponse lets us rewrite __x00__ (null byte encoding) in
        // responses — Cloudflare Tunnel blocks URLs containing __x00__.
        '/dev/storybook': {
          target: storybookTarget,
          changeOrigin: true,
          ws: true,
          selfHandleResponse: true,
          rewrite: (reqPath: string) => {
            const cleaned = reqPath.replace(/^\/dev\/storybook/, '')
            return cleaned || '/'
          },
          configure: (proxy) => {
            // Remove accept-encoding so upstream doesn't compress responses,
            // making text rewriting simpler
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('accept-encoding')
            })
            proxy.on('proxyRes', (proxyRes, _req, res) => {
              const contentType = proxyRes.headers['content-type'] || ''
              const isText = contentType.includes('text/') ||
                contentType.includes('javascript') ||
                contentType.includes('json')

              if (isText) {
                // Buffer and decompress (if needed) text responses,
                // then rewrite __x00__ virtual module URLs
                const chunks: Buffer[] = []
                proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk))
                proxyRes.on('end', () => {
                  const raw = Buffer.concat(chunks)
                  const encoding = proxyRes.headers['content-encoding']

                  const rewriteAndSend = (buf: Buffer) => {
                    let body = buf.toString()
                    // Rewrite Vite virtual module URLs (Cloudflare blocks __x00__)
                    body = body.replaceAll(
                      '/@id/__x00__virtual:/@storybook/',
                      '/dev/storybook/_sb_vmod/'
                    )
                    // Prefix ALL Storybook absolute paths so they route through the proxy.
                    // Without this, the browser fetches them from the frontend Vite
                    // (causing dual-React and other module resolution issues).
                    const prefixes = ['/@vite/', '/@id/', '/@fs/', '/@react-refresh', '/.storybook/', '/src/', '/node_modules/']
                    for (const p of prefixes) {
                      body = body.replaceAll(`"${p}`, `"/dev/storybook${p}`)
                      body = body.replaceAll(`'${p}`, `'/dev/storybook${p}`)
                    }
                    const out = Buffer.from(body)
                    const headers = { ...proxyRes.headers }
                    delete headers['transfer-encoding']
                    delete headers['content-encoding']
                    headers['content-length'] = String(out.length)
                    res.writeHead(proxyRes.statusCode ?? 200, headers)
                    res.end(out)
                  }

                  if (encoding === 'gzip') {
                    zlib.gunzip(raw, (err, decoded) => {
                      rewriteAndSend(err ? raw : decoded)
                    })
                  } else if (encoding === 'br') {
                    zlib.brotliDecompress(raw, (err, decoded) => {
                      rewriteAndSend(err ? raw : decoded)
                    })
                  } else if (encoding === 'deflate') {
                    zlib.inflate(raw, (err, decoded) => {
                      rewriteAndSend(err ? raw : decoded)
                    })
                  } else {
                    rewriteAndSend(raw)
                  }
                })
              } else {
                // Binary responses: pass through unchanged
                res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers)
                proxyRes.pipe(res)
              }
            })
          },
        },
      }
    },
    resolve: {
      alias: {
        '@copilot/testing': path.resolve(__dirname, './src/shared/copilot/testing/index.ts'),
        '@copilot': path.resolve(__dirname, './src/shared/copilot/index.ts'),
        '@': path.resolve(__dirname, './src'),
        '~': path.resolve(__dirname, './node_modules'),

      },
    },
  }
})
