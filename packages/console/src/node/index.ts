import { Context, Schema } from 'koishi'
import HttpService from './http'
import WsService from './ws'
import { Console, DataService, Entry } from '../shared'

export * from '../shared'
export * from './http'
export * from './ws'

declare module '../shared' {
  namespace Console {
    interface Services {
      http?: HttpService
      ws?: WsService
    }
  }
}

interface ClientConfig {
  devMode: boolean
  uiPath: string
  endpoint: string
}

class NodeConsole extends Console {
  public global = {} as ClientConfig

  constructor(public ctx: Context, public config: NodeConsole.Config) {
    super(ctx)

    const { devMode, uiPath, apiPath, selfUrl } = config
    this.global.devMode = devMode
    this.global.uiPath = uiPath
    this.global.endpoint = selfUrl + apiPath

    ctx.plugin(HttpService, config)
    ctx.plugin(WsService, config)
  }

  addEntry(entry: string | Entry) {
    this.http.addEntry(entry)
  }

  addListener<K extends keyof Events>(event: K, callback: Events[K], options?: DataService.Options) {
    this.ws.addListener(event, { callback, ...options })
  }

  broadcast(type: string, body: any, options: DataService.Options) {
    this.ws.broadcast(type, body, options)
  }
}

export interface Events {}

namespace NodeConsole {
  export interface Config extends HttpService.Config, WsService.Config {}

  export const Config: Schema<Config> = Schema.object({
    uiPath: Schema
      .string()
      .description('前端页面呈现的路径。')
      .default(''),
    apiPath: Schema
      .string()
      .description('后端 API 服务的路径。')
      .default('/status'),
    selfUrl: Schema
      .string()
      .description('Koishi 服务暴露在公网的地址。')
      .role('link')
      .default(''),
    open: Schema
      .boolean()
      .description('在应用启动后自动在浏览器中打开控制台。'),
    devMode: Schema
      .boolean()
      .description('启用调试模式（仅供开发者使用）。')
      .default(process.env.NODE_ENV === 'development')
      .hidden(),
    cacheDir: Schema
      .string()
      .description('调试服务器缓存目录。')
      .default('.vite')
      .hidden(),
  })
}

export default NodeConsole