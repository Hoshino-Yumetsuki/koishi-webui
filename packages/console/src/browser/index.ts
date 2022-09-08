import { Context, Schema } from 'koishi'
import { Console, Entry, SocketHandle } from '../shared'

export * from '../shared'

class BrowserConsole extends Console {
  constructor(public ctx: Context) {
    super(ctx)
    // eslint-disable-next-line no-new
    new SocketHandle(ctx, ctx[Symbol.for('koishi.socket')])
  }

  resolveEntry(entry: string | string[] | Entry) {
    if (typeof entry === 'string' || Array.isArray(entry)) return entry
    return entry.prod
  }
}

namespace BrowserConsole {
  export interface Config {}

  export const Config: Schema<Config> = Schema.object({})
}

export default BrowserConsole