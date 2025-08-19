import WebSocket from 'ws';
import router from '@/services/router';
import sellers from '@/services/sellers';
import { WebRtcTransport } from 'mediasoup/types';

const AUTH_BASE = process.env.AUTH_BASE;
const AGENTS = (()=>{ try { return JSON.parse(process.env.AGENTS_JSON || '{}'); } catch { return {}; } })();

function wsSend(ws: WebSocket, type: string, data: string | object | boolean) { try { ws.send(JSON.stringify({ type, data })); } catch {} }

function getAgentSocket(code: string) {
  const s = sellers.get(code); if (!s) return null;
  if (s.agentWS && s.agentWS.readyState === WebSocket.OPEN) return s.agentWS;
  const url = AGENTS[code]; if (!url) return null;
  const ws = new WebSocket(url); s.agentWS = ws;
  ws.on('close', () => { s.agentWS = null; }); ws.on('error', () => { s.agentWS = null; });
  return ws;
}

async function validateSid({ sid, sellerCode }: {sid: string, sellerCode: string}) {
  const u = new URL('/auth/validate', AUTH_BASE);
  u.searchParams.set('sid', sid);
  u.searchParams.set('seller', sellerCode);
  const r = await fetch(u.toString());
  if (!r.ok) return { ok:false };
  return r.json();
}

export const handleWs = async (socket: WebSocket) => {
  socket.send(JSON.stringify({ type: 'hello', ts: Date.now() }))
  // keep-alive
  const ping = setInterval(() => {
    if (socket.readyState === socket.OPEN) socket.ping()
  }, 30000)
  let transportRecv: null | WebRtcTransport;
  socket.on('message', async (msg: string) => {
    const { type, data } = JSON.parse(msg.toString());
    const sellerCode = data.sellerCode;
    try {
      if (type === 'join') {
        const sid = data.sid;
        const v = await validateSid({ sid, sellerCode });
        if (!v.ok) { wsSend(socket, 'error', 'auth_failed'); return; }
        const r = await router();
        const s = sellers.get(sellerCode);
        if (!s || !s.videoProducer) { wsSend(socket, 'error', 'stream_not_ready'); return; }
        const webRtcTransport = await r.createWebRtcTransport({
          listenIps: [{ ip: '0.0.0.0', announcedIp: undefined }],
          enableUdp: true, enableTcp: true, preferUdp: true
        });
        transportRecv = webRtcTransport;
        wsSend(socket, 'webrtctransport', {
          id: webRtcTransport.id,
          iceParameters: webRtcTransport.iceParameters,
          iceCandidates: webRtcTransport.iceCandidates,
          dtlsParameters: webRtcTransport.dtlsParameters,
          rtpCapabilities: r.rtpCapabilities
        });
      } else if (type === 'connect') {
        await transportRecv?.connect({ dtlsParameters: data.dtlsParameters });
        wsSend(socket, 'connected', true);
        const s = sellers.get(sellerCode);
        const consumers = [];
        const r = await router();
        if (s?.videoProducer) {
          const c = await transportRecv?.consume({ producerId: s.videoProducer.id, rtpCapabilities: r.rtpCapabilities });
          if (c) {
            consumers.push({ kind: 'video', id: c.id, producerId: s.videoProducer.id, rtpParameters: c.rtpParameters });
            socket.once('close', () => c.close());
          }
        }
        if (s?.audioProducer) {
          const c = await transportRecv?.consume({ producerId: s.audioProducer.id, rtpCapabilities: r.rtpCapabilities });
          if (c) {
            consumers.push({ kind: 'audio', id: c.id, producerId: s.audioProducer.id, rtpParameters: c.rtpParameters });
            socket.once('close', () => c.close());
          }
        }
        wsSend(socket, 'consumers', consumers);
      } else if (type === 'control') {
        const agent = getAgentSocket(sellerCode);
        if (agent && agent.readyState === WebSocket.OPEN) agent.send(JSON.stringify(data));
      }
    } catch (e) { 
      console.error(e);
      if (e instanceof Error) wsSend(socket, 'error', e.message); 
    }
  })
  socket.on('close', () => clearInterval(ping))
}