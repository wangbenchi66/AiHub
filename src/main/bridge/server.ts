import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { BRIDGE_ORIGIN, BRIDGE_PORTS } from '@shared/bridge'
import type { BridgeCookie } from '@shared/types'
import type { SyncEngine } from './sync-engine'

const MAX_BODY = 16 * 1024 * 1024

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store'
  })
  res.end(payload)
}

function cors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', BRIDGE_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-AiHub-Bridge')
  res.setHeader('Access-Control-Max-Age', '600')
  res.setHeader('Vary', 'Origin')
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text ? JSON.parse(text) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

export class BridgeServer {
  private server: Server | null = null
  private currentPort = 0

  constructor(
    private readonly engine: SyncEngine,
    private readonly version: string
  ) {}

  get port(): number {
    return this.currentPort
  }

  async start(): Promise<number> {
    for (const port of BRIDGE_PORTS) {
      const started = await this.tryListen(port)
      if (started) {
        this.currentPort = port
        this.engine.setPort(port)
        return port
      }
    }
    throw new Error('无法启动本地同步服务（45731–45740 均被占用）')
  }

  private tryListen(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer((req, res) => {
        void this.handle(req, res)
      })
      const onError = (): void => {
        server.close()
        resolve(false)
      }
      server.once('error', onError)
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', onError)
        server.on('error', (error) => console.error('[bridge] server error', error))
        this.server = server
        console.log(`[bridge] listening on 127.0.0.1:${port}`)
        resolve(true)
      })
    })
  }

  stop(): void {
    this.server?.close()
    this.server = null
  }

  private authorized(req: IncomingMessage): boolean {
    const origin = req.headers.origin
    const host = req.headers.host ?? ''
    const bridgeHeader = req.headers['x-aihub-bridge']
    // Chrome extension service-worker fetches to localhost don't send Origin.
    // A web page always sends Origin (and would need a preflight for the custom
    // header), so an absent Origin + the bridge header is only accepted from
    // extension-like callers.
    if (origin && origin !== BRIDGE_ORIGIN) return false
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return false
    return bridgeHeader === '1'
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    cors(res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (!this.authorized(req)) {
      console.log('[bridge] forbidden', {
        origin: req.headers.origin,
        host: req.headers.host,
        bridge: req.headers['x-aihub-bridge']
      })
      json(res, 403, { ok: false, error: 'forbidden' })
      return
    }

    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
      const wasConnected = this.engine.status().connected
      this.engine.touch()

      if (req.method === 'GET' && url.pathname === '/v1/health') {
        if (!wasConnected) console.log('[bridge] extension connected')
        json(res, 200, {
          app: 'AiHub',
          version: this.version,
          session: this.engine.sessionId(),
          port: this.currentPort,
          applied: this.engine.status().applied ?? 0,
          conflicts: this.engine.status().conflicts ?? 0,
          lastSyncAt: this.engine.status().lastSyncAt
        })
        return
      }

      if (req.method === 'POST' && url.pathname === '/v1/sync') {
        if (!this.engine.isLinked()) {
          json(res, 409, { ok: false, error: 'not-linked' })
          return
        }
        const body = (await readJson(req)) as {
          cookies?: BridgeCookie[]
          session?: string
        }
        if (!Array.isArray(body.cookies)) {
          json(res, 400, { ok: false, error: 'invalid cookies' })
          return
        }
        const result = await this.engine.fullSync(body.cookies.slice(0, 5000))
        console.log(
          `[bridge] full sync: ${body.cookies.length} cookies, ${result.appliedToApp} applied, ${result.conflicts} conflicts`
        )
        json(res, 200, result)
        return
      }

      if (req.method === 'POST' && url.pathname === '/v1/events') {
        const body = (await readJson(req)) as {
          events?: Array<{ op: 'set' | 'remove'; cookie: BridgeCookie }>
        }
        if (!Array.isArray(body.events)) {
          json(res, 400, { ok: false, error: 'invalid events' })
          return
        }
        const result = await this.engine.applyBrowserEvents(body.events.slice(0, 500))
        console.log(`[bridge] browser events: ${body.events.length}, applied ${result.applied}`)
        json(res, 200, { ok: true, ...result })
        return
      }

      if (req.method === 'GET' && url.pathname === '/v1/events') {
        const since = Number(url.searchParams.get('since') ?? '0') || 0
        const session = url.searchParams.get('session') ?? ''
        if (session !== this.engine.sessionId()) {
          json(res, 200, {
            session: this.engine.sessionId(),
            cursor: 0,
            reset: true,
            fullSync: true,
            events: []
          })
          return
        }
        const result = await this.engine.waitForEvents(since, 25_000)
        json(res, 200, result)
        return
      }

      if (req.method === 'POST' && url.pathname === '/v1/ack') {
        const body = (await readJson(req)) as {
          syncId?: string
          ok?: string[]
          failed?: string[]
        }
        if (!body.syncId) {
          json(res, 400, { ok: false, error: 'invalid ack' })
          return
        }
        this.engine.ackSync(body.syncId, body.ok ?? [], body.failed ?? [])
        json(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && url.pathname === '/v1/ack-events') {
        const body = (await readJson(req)) as {
          acks?: Array<{ seq: number; ok: boolean }>
        }
        this.engine.ackEvents(body.acks ?? [])
        json(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && url.pathname === '/v1/storage') {
        const body = (await readJson(req)) as {
          origin?: string
          local?: Record<string, string>
          session?: Record<string, string>
        }
        let parsed: URL | null = null
        try {
          parsed = new URL(body.origin ?? '')
        } catch {
          parsed = null
        }
        if (
          !parsed ||
          (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
          parsed.origin !== body.origin
        ) {
          json(res, 400, { ok: false, error: 'invalid storage origin' })
          return
        }
        const local = body.local ?? {}
        const session = body.session ?? {}
        if (typeof local !== 'object' || typeof session !== 'object') {
          json(res, 400, { ok: false, error: 'invalid storage' })
          return
        }
        this.engine.setSiteStorage(body.origin as string, local, session)
        json(res, 200, {
          ok: true,
          count: Object.keys(local).length + Object.keys(session).length
        })
        return
      }

      json(res, 404, { ok: false, error: 'not found' })
    } catch (error) {
      json(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : 'bad request'
      })
    }
  }
}
