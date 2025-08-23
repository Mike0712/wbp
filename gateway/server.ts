// В server.ts
import next from 'next'
import { createServer } from 'http'
import { parse } from 'url'
import { attachToServer } from './backend'

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

async function main() {
  await app.prepare()

  // Создаем HTTP сервер с кастомной обработкой маршрутов
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url || '', true)
    const { pathname } = parsedUrl
    
    // Все запросы передаем в Next.js
    handle(req, res)
  })

  // Подключаем бэкенд приложение
  attachToServer(server)

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
    console.log(`➡️ Next + WS: http://localhost:${port}  (ws: /api-ws)`)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})