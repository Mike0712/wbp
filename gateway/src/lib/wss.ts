import type { Server as HttpServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'

declare global {
  var _wss: WebSocketServer | undefined
}

export function initWSS(server: HttpServer) {
  if (!global._wss) {
    const wss = new WebSocketServer({ server })

    wss.on('connection', (socket: WebSocket) => {
      socket.send(JSON.stringify({ type: 'hello', ts: Date.now() }))
      // keep-alive
      const ping = setInterval(() => {
        if (socket.readyState === socket.OPEN) socket.ping()
      }, 30000)
      socket.on('close', () => clearInterval(ping))
    })

    global._wss = wss
  }
  return global._wss
}

export function getWSS() {
  if (!global._wss) throw new Error('WSS not initialized')
  return global._wss
}
