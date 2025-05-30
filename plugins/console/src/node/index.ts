import { Context, Dict, h, makeArray, noop, Schema, Time } from 'koishi'
import { WebSocketLayer } from '@koishijs/plugin-server'
import { Console, Entry } from '@koishijs/console'
import { FileSystemServeOptions, ViteDevServer } from 'vite'
import { extname, resolve } from 'path'
import { createReadStream, existsSync, promises as fs, Stats } from 'fs'
import {} from '@koishijs/plugin-server-proxy'
import open from 'open'
import { createRequire } from 'module'
import { fileURLToPath, pathToFileURL } from 'url'

declare module 'koishi' {
  interface EnvData {
    clientCount?: number
  }
}

export * from '@koishijs/console'

export interface ClientConfig {
  devMode: boolean
  uiPath: string
  endpoint: string
  static?: boolean
  heartbeat?: HeartbeatConfig
  proxyBase?: string
}

interface HeartbeatConfig {
  interval?: number
  timeout?: number
}

class NodeConsole extends Console {
  static inject = { required: ['server'], optional: ['console'] }
  // static inject = ['server']

  // workaround for edge case (collision with @koishijs/plugin-config)
  private _config: NodeConsole.Config

  public vite: ViteDevServer
  public root: string
  public layer: WebSocketLayer

  constructor(public ctx: Context, config: NodeConsole.Config) {
    super(ctx)
    this.config = config

    this.layer = ctx.server.ws(config.apiPath, (socket, request) => {
      // @types/ws does not provide typings for `dispatchEvent`
      this.accept(socket as any, request)
    })

    ctx.on('console/connection', () => {
      const loader = ctx.get('loader')
      if (!loader) return
      loader.envData.clientCount = this.layer.clients.size
    })

    // @ts-ignore
    const base = import.meta.url || pathToFileURL(__filename).href
    const require = createRequire(base)
    this.root = config.devMode
      ? resolve(require.resolve('@koishijs/client/package.json'), '../app')
      : fileURLToPath(new URL('../../dist', base))
  }

  // @ts-ignore FIXME
  get config() {
    return this._config
  }

  set config(value) {
    this._config = value
  }

  createGlobal() {
    const global = {} as ClientConfig
    const { devMode, uiPath, apiPath, selfUrl, heartbeat } = this.config
    global.devMode = devMode
    global.uiPath = uiPath
    global.heartbeat = heartbeat
    global.endpoint = selfUrl + apiPath
    const proxy = this.ctx.get('server.proxy')
    if (proxy) global.proxyBase = proxy.config.path + '/'
    return global
  }

  async start() {
    if (this.config.devMode) await this.createVite()
    this.serveAssets()

    this.ctx.on('server/ready', () => {
      let { host, port } = this.ctx.server
      if (['0.0.0.0', '::'].includes(host)) host = '127.0.0.1'
      const target = `http://${host}:${port}${this.config.uiPath}`
      if (this.config.open && !this.ctx.get('loader')?.envData.clientCount && !process.env.KOISHI_AGENT) {
        open(target)
      }
      this.ctx.logger.info('webui is available at %c', target)
    })
  }

  private getFiles(files: Entry.Files) {
    if (typeof files === 'string' || Array.isArray(files)) return files
    if (!this.config.devMode) return files.prod
    if (!existsSync(files.dev)) return files.prod
    return files.dev
  }

  resolveEntry(files: Entry.Files, key: string) {
    const { devMode, uiPath } = this.config
    const filenames: string[] = []
    for (const local of makeArray(this.getFiles(files))) {
      const filename = devMode ? '/vite/@fs/' + local : uiPath + '/@plugin-' + key
      if (extname(local)) {
        filenames.push(filename)
      } else {
        filenames.push(filename + '/index.js')
        if (existsSync(local + '/style.css')) {
          filenames.push(filename + '/style.css')
        }
      }
    }
    return filenames
  }

  private serveAssets() {
    const { uiPath } = this.config

    this.ctx.server.get(uiPath + '(.*)', async (ctx, next) => {
      await next()
      if (ctx.body || ctx.response.body) return

      // add trailing slash and redirect
      if (ctx.path === uiPath && !uiPath.endsWith('/')) {
        return ctx.redirect(ctx.path + '/')
      }

      const name = ctx.path.slice(uiPath.length).replace(/^\/+/, '')
      const sendFile = (filename: string) => {
        ctx.type = extname(filename)
        return ctx.body = createReadStream(filename)
      }

      if (name.startsWith('@plugin-')) {
        const [key] = name.slice(8).split('/', 1)
        if (this.entries[key]) {
          const files = makeArray(this.getFiles(this.entries[key].files))
          const filename = files[0] + name.slice(8 + key.length)
          ctx.type = extname(filename)
          if (this.config.devMode || ctx.type !== 'application/javascript') {
            return sendFile(filename)
          }

          // we only transform js imports in production mode
          const source = await fs.readFile(filename, 'utf8')
          return ctx.body = await this.transformImport(source)
        } else {
          return ctx.status = 404
        }
      }

      const filename = resolve(this.root, name)
      if (!filename.startsWith(this.root) && !filename.includes('node_modules')) {
        return ctx.status = 403
      }

      const stats = await fs.stat(filename).catch<Stats>(noop)
      if (stats?.isFile()) return sendFile(filename)
      const template = await fs.readFile(resolve(this.root, 'index.html'), 'utf8')
      ctx.type = 'html'
      ctx.body = await this.transformHtml(template)
    })
  }

  private async transformImport(source: string) {
    let output = ''
    let cap: RegExpExecArray
    while ((cap = /((?:^|;)import\b[^'"]+\bfrom\s*)(['"])([^'"]+)\2;/m.exec(source))) {
      const [stmt, left, quote, path] = cap
      output += source.slice(0, cap.index) + left + quote + ({
        'vue': '../vue.js',
        'vue-router': '../vue-router.js',
        '@vueuse/core': '../vueuse.js',
        '@koishijs/client': '../client.js',
      }[path] ?? path) + quote + ';'
      source = source.slice(cap.index + stmt.length)
    }
    return output + source
  }

  private async transformHtml(template: string) {
    const { uiPath, head = [] } = this.config
    if (this.vite) {
      template = await this.vite.transformIndexHtml(uiPath, template)
    } else {
      template = template.replace(/(href|src)="(?=\/)/g, (_, $1) => `${$1}="${uiPath}`)
    }
    let headInjection = `<script>KOISHI_CONFIG = ${JSON.stringify(this.createGlobal())}</script>`
    for (const { tag, attrs = {}, content } of head) {
      const attrString = Object.entries(attrs).map(([key, value]) => ` ${key}="${h.escape(value ?? '', true)}"`).join('')
      headInjection += `<${tag}${attrString}>${content ?? ''}</${tag}>`
    }
    return template.replace('<title>', headInjection + '<title>')
  }

  private async createVite() {
    const { cacheDir, dev } = this.config
    const { createServer } = require('@koishijs/client/lib') as typeof import('@koishijs/client/lib')

    this.vite = await createServer(this.ctx.baseDir, {
      cacheDir: resolve(this.ctx.baseDir, cacheDir),
      server: {
        fs: dev.fs,
      },
    })

    this.ctx.server.all('/vite(.*)', (ctx) => new Promise((resolve) => {
      this.vite.middlewares(ctx.req, ctx.res, resolve)
    }))

    this.ctx.on('dispose', () => this.vite.close())
  }

  stop() {
    this.layer.close()
  }
}

namespace NodeConsole {
  export interface Dev {
    fs: FileSystemServeOptions
  }

  export const Dev: Schema<Dev> = Schema.object({
    fs: Schema.object({
      strict: Schema.boolean().default(true),
      allow: Schema.array(String).default(null),
      deny: Schema.array(String).default(null),
    }).hidden(),
  })

  export interface Head {
    tag: string
    attrs?: Dict<string>
    content?: string
  }

  export const Head: Schema<Head> = Schema.intersect([
    Schema.object({
      tag: Schema.union([
        'title',
        'link',
        'meta',
        'script',
        'style',
        Schema.string(),
      ]).required(),
    }),
    Schema.union([
      Schema.object({
        tag: Schema.const('title').required(),
        content: Schema.string().role('textarea'),
      }),
      Schema.object({
        tag: Schema.const('link').required(),
        attrs: Schema.dict(Schema.string()).role('table'),
      }),
      Schema.object({
        tag: Schema.const('meta').required(),
        attrs: Schema.dict(Schema.string()).role('table'),
      }),
      Schema.object({
        tag: Schema.const('script').required(),
        attrs: Schema.dict(Schema.string()).role('table'),
        content: Schema.string().role('textarea'),
      }),
      Schema.object({
        tag: Schema.const('style').required(),
        attrs: Schema.dict(Schema.string()).role('table'),
        content: Schema.string().role('textarea'),
      }),
      Schema.object({
        tag: Schema.string().required(),
        attrs: Schema.dict(Schema.string()).role('table'),
        content: Schema.string().role('textarea'),
      }),
    ]),
  ])

  export interface Config {
    uiPath?: string
    devMode?: boolean
    cacheDir?: string
    open?: boolean
    head?: Head[]
    selfUrl?: string
    apiPath?: string
    heartbeat?: HeartbeatConfig
    dev?: Dev
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      uiPath: Schema.string().default(''),
      apiPath: Schema.string().default('/status'),
      selfUrl: Schema.string().role('link').default(''),
      open: Schema.boolean(),
      head: Schema.array(Head),
      heartbeat: Schema.object({
        interval: Schema.number().default(Time.second * 30),
        timeout: Schema.number().default(Time.minute),
      }),
      devMode: Schema.boolean().default(process.env.NODE_ENV === 'development').hidden(),
      cacheDir: Schema.string().default('cache/vite').hidden(),
      dev: Dev,
    }),
  ]).i18n({
    'zh-CN': require('./locales/zh-CN'),
  })
}

export default NodeConsole
