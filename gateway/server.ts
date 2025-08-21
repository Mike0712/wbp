// В server.ts
import next from 'next'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { handleWs } from './src/lib/ws_handler'
import { parse } from 'url'

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

async function main() {
  await app.prepare()

  // Создаем HTTP сервер с кастомной обработкой маршрутов
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url || '', true)
    const { pathname } = parsedUrl
    
    // Если запрос к /ws - игнорируем его (WebSocket обработает)
    if (pathname?.startsWith('/ws')) {
      res.writeHead(426) // Upgrade Required
      res.end('WebSocket protocol required')
      return
    }
    
    // Все остальные запросы передаем в Next.js
    handle(req, res)
  })
  
  // Создаем WebSocketServer только для пути /ws
  const wss = new WebSocketServer({ 
    noServer: true, // Не привязываемся к серверу автоматически
    maxPayload: 50 * 1024 * 1024 // 50MB
  })
  
  // Обрабатываем upgrade запросы вручную
  server.on('upgrade', (request, socket, head) => {
    const parsedUrl = parse(request.url || '', true)
    const { pathname } = parsedUrl
    
    // Проверяем, что запрос идет на /ws
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request)
      })
    } else {
      // Закрываем соединение для других путей
      socket.destroy()
    }
  })
  
  // Обрабатываем WebSocket соединения
  wss.on('connection', (socket) => {
    try {
      handleWs(socket)
    } catch (e) {
      console.error('Error handling WebSocket connection:', e)
      try { socket.terminate() } catch {}
    }
  })

  // Добавляем обработчик необработанных исключений
  process.on('uncaughtException', (error: { code: string, message: string }) => {
    // Проверяем, связана ли ошибка с WebSocket
    if (error.code === 'WS_ERR_INVALID_CLOSE_CODE' || 
        error.message?.includes('invalid status code')) {
      console.warn('WebSocket error (handled):', error.message)
    } else {
      console.error('Uncaught exception:', error)
      // Для других критических ошибок можно завершить процесс
      // process.exit(1)
    }
  })

  // Добавляем обработчик отклоненных промисов
  process.on('unhandledRejection', (reason, promise) => {
    console.warn('Unhandled Rejection at:', promise, 'reason:', reason)
    // Не завершаем процесс
  })

  const port = process.env.PORT ? Number(process.env.PORT) : 3000
  server.listen(port, () => {
    console.log(`➡️ Next + WS: http://localhost:${port}  (ws: /ws)`)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})