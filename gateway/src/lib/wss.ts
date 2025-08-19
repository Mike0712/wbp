import type { Server as HttpServer } from 'http'
import { WebSocketServer } from 'ws'
import { handleWs } from './ws_handler'

declare global {
  var _wss: WebSocketServer | undefined
}

export function initWSS(server: HttpServer) {
  if (!global._wss) {
    const wss = new WebSocketServer({ server })

    wss.on('connection', handleWs)

    global._wss = wss
  }
  return global._wss
}

export function getWSS() {
  if (!global._wss) throw new Error('WSS not initialized')
  return global._wss
}
