import express, { Request, Response } from 'express'
import { WebSocketServer } from 'ws'
import { Server, IncomingMessage } from 'http'
import * as mediasoup from 'mediasoup';
import { AppData, WebRtcTransport } from 'mediasoup/types';
import WebSocket from 'ws';
import fetch from 'node-fetch';

const PORT = process.env.PORT;
const RTP_MIN_PORT = Number(process.env.RTP_MIN_PORT);
const RTP_MAX_PORT = Number(process.env.RTP_MAX_PORT);
const AGENTS = (()=>{ try { return JSON.parse(process.env.AGENTS_JSON || '{}'); } catch { return {}; } })();
const AUTH_BASE = process.env.AUTH_BASE;

// Создаем Express приложение
const app = express()

const w = async () => {
  const worker = await mediasoup.createWorker({ rtcMinPort: RTP_MIN_PORT, rtcMaxPort: RTP_MAX_PORT });
  worker.on('died', () => { console.error('mediasoup worker died'); process.exit(1); });
  return worker;
}

const r = (async () => {
  const worker = await w();
  const router = await worker.createRouter({
    mediaCodecs: [
      { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
      { kind: 'video', mimeType: 'video/H264', clockRate: 90000,
        parameters: { 'packetization-mode': 1, 'profile-level-id': '42e01f', 'level-asymmetry-allowed': 1 } }
    ]
  });
  return router;
});


// Базовые роуты
app.get('/rtpCapabilities', async (_req, res) => {
  const router = await r();
  res.json(router.rtpCapabilities);
});

const sellers = new Map(); // code -> { videoTransport, audioTransport, videoProducer, audioProducer, agentWS }

app.post('/rtp-endpoint/:sellerCode', async (req, res) => {
  const code = String(req.params.sellerCode);

  const ANNOUNCED_IP = process.env.RTP_ANNOUNCED_IP;
  const router = await r();
  
  const videoTransport = await router.createPlainTransport({ 
    listenIp: { ip: '0.0.0.0', announcedIp: ANNOUNCED_IP }, 
    rtcpMux: true,
    comedia: true
  });
  const audioTransport = await router.createPlainTransport({ 
    listenIp: { ip: '0.0.0.0', announcedIp: ANNOUNCED_IP }, 
    rtcpMux: true, 
    comedia: true 
  });
  const s = sellers.get(code) || {};
  s.videoTransport = videoTransport; s.audioTransport = audioTransport;
  sellers.set(code, s);

  res.json({
    video: { ip: ANNOUNCED_IP || videoTransport.tuple.localIp, port: videoTransport.tuple.localPort },
    audio: { ip: ANNOUNCED_IP || audioTransport.tuple.localIp, port: audioTransport.tuple.localPort },
    videoPt: 102, audioPt: 111, rtcpMux: true
  });
});

app.post('/rtp-producers/:sellerCode', async (req, res) => {
  const code = String(req.params.sellerCode);
  const s = sellers.get(code);
  if (!s) return res.status(404).json({ error: 'no transport' });
  try {
    if (!s.videoProducer) {
      s.videoProducer = await s.videoTransport.produce({
        kind: 'video',
        rtpParameters: { codecs: [{ mimeType: 'video/H264', clockRate: 90000, payloadType: 102, parameters: { 'packetization-mode': 1 } }], encodings: [{ ssrc: Math.floor(Math.random()*1e9) }] }
      });
    }
    if (!s.audioProducer) {
      s.audioProducer = await s.audioTransport.produce({
        kind: 'audio',
        rtpParameters: { codecs: [{ mimeType: 'audio/opus', clockRate: 48000, channels: 2, payloadType: 111 }], encodings: [{ ssrc: Math.floor(Math.random()*1e9) }] }
      });
    }
    res.json({ ok:true });
  } catch (e) {
    console.error('produce_failed', e);
    res.status(500).json({ error: 'produce_failed' });
  }
});

function getAgentSocket(code: string) {
  const s = sellers.get(code); if (!s) return null;
  if (s.agentWS && s.agentWS.readyState === WebSocket.OPEN) return s.agentWS;
  const url = AGENTS[code]; if (!url) return null;
  const ws = new WebSocket(url); s.agentWS = ws;
  ws.on('close', () => { s.agentWS = null; }); ws.on('error', () => { s.agentWS = null; });
  return ws;
}

function wsSend(ws: WebSocket, type: string, data: string | object | boolean) { try { ws.send(JSON.stringify({ type, data })); } catch {} }

async function validateSid({ sid, sellerCode }: { sid: string, sellerCode: string }) {
  const u = new URL('/auth/validate', AUTH_BASE);
  u.searchParams.set('sid', sid);
  u.searchParams.set('seller', sellerCode);
  const r = await fetch(u.toString());
  if (!r.ok) return { ok:false };
  return r.json();
}

// WebSocket сервер
const wss = new WebSocketServer({ 
  noServer: true,
  maxPayload: 50 * 1024 * 1024 // 50MB
})

// Обработчик WebSocket соединений
wss.on('connection', async (ws) => {
  let transportRecv: WebRtcTransport<AppData> | null = null;
  ws.on('message', async (msg) => {
    const { type, data } = JSON.parse(msg.toString());
    try {
      if (type === 'join') {
        const sellerCode = data.sellerCode;
        const sid = data.sid;
        const v = await validateSid({ sid, sellerCode }) as { ok: boolean };
        if (!v.ok) { wsSend(ws, 'error', 'auth_failed'); return; }

        const s = sellers.get(sellerCode);
        if (!s || !s.videoProducer) { wsSend(ws, 'error', 'stream_not_ready'); return; }

        const router = await r();
        const webRtcTransport = await router.createWebRtcTransport({
          listenIps: [{ ip: '0.0.0.0' }],
          enableUdp: true, enableTcp: true, preferUdp: true
        });
        transportRecv = webRtcTransport;
        wsSend(ws, 'webrtctransport', {
          id: webRtcTransport.id,
          iceParameters: webRtcTransport.iceParameters,
          iceCandidates: webRtcTransport.iceCandidates,
          dtlsParameters: webRtcTransport.dtlsParameters,
          rtpCapabilities: router.rtpCapabilities
        });
      } else if (type === 'connect') {
        const sellerCode = data.sellerCode;
        if (!transportRecv) { wsSend(ws, 'error', 'transport_not_ready'); return; }
        await transportRecv.connect({ dtlsParameters: data.dtlsParameters });
        wsSend(ws, 'connected', true);
        const s = sellers.get(sellerCode);
        const consumers = [];
        const router = await r();
        if (s?.videoProducer) {
          const c = await transportRecv.consume({ producerId: s.videoProducer.id, rtpCapabilities: router.rtpCapabilities });
          consumers.push({ kind: 'video', id: c.id, producerId: s.videoProducer.id, rtpParameters: c.rtpParameters });
          ws.once('close', () => c.close());
        }
        if (s?.audioProducer) {
          const c = await transportRecv.consume({ producerId: s.audioProducer.id, rtpCapabilities: router.rtpCapabilities });
          consumers.push({ kind: 'audio', id: c.id, producerId: s.audioProducer.id, rtpParameters: c.rtpParameters });
          ws.once('close', () => c.close());
        }
        wsSend(ws, 'consumers', consumers);
      } else if (type === 'control') {
        const sellerCode = data.sellerCode;
        const agent = getAgentSocket(sellerCode);
        if (agent && agent.readyState === WebSocket.OPEN) agent.send(JSON.stringify({ ...data, sellerCode }));
      }
    } catch (e) { console.error(e); wsSend(ws, 'error', e instanceof Error ? e.message : 'unknown error'); }
  })
})

// Функция для подключения к существующему HTTP серверу
export function attachToServer(server: Server) {
  // Обработка HTTP запросов
  const _app = app as any
  server.on('request', (req: IncomingMessage, res) => {
    if (req.url?.startsWith('/api')) {
      req.url = req.url.replace('/api', '')
      _app(req, res)
    }
  })

  // Обработка WebSocket
  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/api-ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request)
      })
    }
  })
}
