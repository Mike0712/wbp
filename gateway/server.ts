import next from 'next'
import http from 'http'
import { initWSS } from './src/lib/wss'  // см. ниже

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

async function main() {
  await app.prepare()

  const server = http.createServer((req, res) => handle(req, res))

  initWSS(server);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000
  server.listen(port, () => {
    console.log(`➡️ Next + WS: http://localhost:${port}  (ws: /ws)`)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
