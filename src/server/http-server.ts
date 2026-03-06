/**
 * HTTP Server for CRM MCP — Streamable HTTP Transport (stateless).
 *
 * selfhosted-supabase-mcp'den sadeleştirildi:
 * - JWT yerine basit Bearer token karşılaştırması (ElevenAgents secret_token)
 * - Privilege level gereksiz (tek client = ElevenAgents)
 * - CORS wildcard (ElevenAgents IP'leri değişebilir)
 *
 * Güvenlik katmanları:
 * - Bearer token auth
 * - Rate limiting (100 req/min)
 * - Security headers
 * - Request timeout (30s)
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { Server as HttpServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export interface HttpMcpServerOptions {
  port: number;
  host: string;
  authToken: string;       // Bearer token (MCP_AUTH_TOKEN)
  rateLimitMaxRequests?: number;  // Default: 100
  rateLimitWindowMs?: number;     // Default: 60000 (1 min)
  requestTimeoutMs?: number;      // Default: 30000 (30s)
  // REST tool executor — ElevenLabs webhook tools için
  toolExecutor?: (name: string, args: unknown) => Promise<unknown>;
}

export type McpServerFactory = () => Server;

export class HttpMcpServer {
  private app: Express;
  private httpServer: HttpServer | null = null;
  private readonly options: HttpMcpServerOptions;
  private readonly mcpServerFactory: McpServerFactory;
  private requestCounts: Map<string, { count: number; resetTime: number }> = new Map();
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(options: HttpMcpServerOptions, mcpServerFactory: McpServerFactory) {
    this.options = options;
    this.mcpServerFactory = mcpServerFactory;
    this.app = express();

    this.setupMiddleware();
    this.setupRoutes();

    // Rate limit entry temizleme (60s aralıkla, bellek sızıntısını önler)
    this.cleanupIntervalId = setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.requestCounts.entries()) {
        if (now >= record.resetTime) this.requestCounts.delete(key);
      }
    }, 60000);
  }

  // ─── Rate Limiting ──────────────────────────────────────────────────────────

  private checkRateLimit(clientKey: string): { allowed: boolean; remaining: number; resetTime: number } {
    const windowMs = this.options.rateLimitWindowMs ?? 60000;
    const maxReq = this.options.rateLimitMaxRequests ?? 100;
    const now = Date.now();

    let record = this.requestCounts.get(clientKey);
    if (!record || now >= record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      this.requestCounts.set(clientKey, record);
      return { allowed: true, remaining: maxReq - 1, resetTime: record.resetTime };
    }

    if (record.count >= maxReq) {
      return { allowed: false, remaining: 0, resetTime: record.resetTime };
    }

    record.count++;
    return { allowed: true, remaining: maxReq - record.count, resetTime: record.resetTime };
  }

  private getClientKey(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  // ─── Middleware ─────────────────────────────────────────────────────────────

  private setupMiddleware(): void {
    // Security headers
    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      res.header('X-Content-Type-Options', 'nosniff');
      res.header('X-Frame-Options', 'DENY');
      res.header('X-XSS-Protection', '1; mode=block');
      res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      res.header('Referrer-Policy', 'no-referrer');
      res.removeHeader('X-Powered-By');
      next();
    });

    // JSON body parser
    this.app.use(express.json());

    // Request timeout
    const timeoutMs = this.options.requestTimeoutMs ?? 30000;
    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setTimeout(timeoutMs, () => {
        if (!res.headersSent) {
          res.status(504).json({ error: 'Gateway Timeout', message: `Request timed out after ${timeoutMs}ms` });
        }
      });
      next();
    });

    // Rate limiting (health endpoint hariç)
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path === '/health') { next(); return; }

      const clientKey = this.getClientKey(req);
      const { allowed, remaining, resetTime } = this.checkRateLimit(clientKey);

      res.header('X-RateLimit-Limit', String(this.options.rateLimitMaxRequests ?? 100));
      res.header('X-RateLimit-Remaining', String(remaining));
      res.header('X-RateLimit-Reset', String(Math.ceil(resetTime / 1000)));

      if (!allowed) {
        const retryAfter = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
        res.header('Retry-After', String(retryAfter));
        res.status(429).json({ error: 'Too Many Requests', retryAfter });
        return;
      }
      next();
    });

    // CORS — wildcard (ElevenAgents IP'leri değişebilir)
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

      if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
      next();
    });
  }

  // ─── Routes ─────────────────────────────────────────────────────────────────

  private setupRoutes(): void {
    // Health check — auth gerektirmez
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', tools: 8, transport: 'streamable-http' });
    });

    // Bearer token auth middleware — /mcp ve /tools için
    // "Bearer TOKEN" veya salt "TOKEN" formatını kabul eder (ElevenLabs her ikisini de gönderebilir)
    const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({ error: 'Unauthorized', message: 'Authorization header required' });
        return;
      }
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      if (token !== this.options.authToken) {
        res.status(403).json({ error: 'Forbidden', message: 'Invalid token' });
        return;
      }
      next();
    };

    this.app.use('/mcp', authMiddleware);

    // ─── REST Tool Endpoints — ElevenLabs webhook tools ──────────────────────
    // POST /tools/:name  →  tool'u çalıştır, JSON dön
    if (this.options.toolExecutor) {
      this.app.use('/tools', authMiddleware);

      this.app.post('/tools/:name', (req: Request, res: Response) => {
        void (async () => {
          const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
          try {
            const result = await this.options.toolExecutor!(name, req.body ?? {});
            res.json(result);
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('Unknown tool')) {
              res.status(404).json({ error: 'Tool not found', tool: name });
            } else {
              console.error(`[CRM-REST] Tool ${name} error:`, error);
              res.status(400).json({ error: message });
            }
          }
        })();
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // POST /mcp — MCP JSON-RPC handler (stateless)
    this.app.post('/mcp', (req: Request, res: Response) => {
      void (async () => {
        try {
          // Her istek için yeni transport + server (stateless mod)
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined, // Stateless
          });
          const server = this.mcpServerFactory();
          await server.connect(transport);
          await transport.handleRequest(req, res, req.body);

          // Request bitince temizle
          res.on('finish', () => {
            transport.close().catch(err => console.error('[HTTP] Transport close error:', err));
            server.close().catch(err => console.error('[HTTP] Server close error:', err));
          });
        } catch (error) {
          console.error('[HTTP] MCP request error:', error);
          if (!res.headersSent) {
            res.status(500).json({
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Internal server error' },
              id: null,
            });
          }
        }
      })();
    });

    // GET/DELETE /mcp — stateless modda desteklenmiyor
    this.app.get('/mcp', (_req: Request, res: Response) => {
      res.status(405).json({ error: 'Method Not Allowed', message: 'Use POST for MCP requests.' });
    });
    this.app.delete('/mcp', (_req: Request, res: Response) => {
      res.status(405).json({ error: 'Method Not Allowed', message: 'Session termination not supported.' });
    });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer = this.app.listen(this.options.port, this.options.host, () => {
        if (this.httpServer) {
          this.httpServer.timeout = this.options.requestTimeoutMs ?? 30000;
          this.httpServer.keepAliveTimeout = 65000;
        }
        console.error(`[CRM-MCP] Server listening on http://${this.options.host}:${this.options.port}`);
        console.error(`[CRM-MCP] POST /mcp  — MCP requests (Bearer token required)`);
        console.error(`[CRM-MCP] GET  /health — Health check`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    return new Promise((resolve, reject) => {
      if (!this.httpServer) { resolve(); return; }
      this.httpServer.close((err) => err ? reject(err) : resolve());
    });
  }
}
