import WebSocket from 'ws';
import router from '@/services/router';
import sellers from '@/services/sellers';
import { WebRtcTransport } from 'mediasoup/types';

const AUTH_BASE = process.env.AUTH_BASE;
const AGENTS = (()=>{ try { return JSON.parse(process.env.AGENTS_JSON || '{}'); } catch { return {}; } })();
function wsSend(ws: WebSocket, type: string, data: string | object | boolean) { 
  console.log('Trying to send', type, data, 'socket state:', ws.readyState);
  if (ws.readyState !== WebSocket.OPEN) {
    console.log('Socket not open, state:', ws.readyState);
    return;
  }
  try { 
    const message = JSON.stringify({ type, data });
    console.log('Sending message:', message);
    ws.send(message); 
    console.log('Message sent successfully');
  } catch (e) { 
    console.error('Error sending message:', e); 
  } 
}

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
  return await r.json();
}

export const handleWs = async (socket: WebSocket) => {
  wsSend(socket, 'hello', '')
  socket.send(JSON.stringify({ type: 'hello', data: {}, ts: Date.now() }))
  // keep-alive
  const ping = setInterval(() => {
    if (socket.readyState === socket.OPEN) socket.ping()
  }, 30000);
  let transportRecv: null | WebRtcTransport;
  socket.on('message', async (msg: string) => {
    // wsSend(socket, 'hello', 'hui');
    const { type, data } = JSON.parse(msg.toString());
    try {
      if (type === 'join') {
        const sellerCode = data.sellerCode;
        const sid = data.sid;
        const v = await validateSid({ sid, sellerCode });
        if (!v.ok) {
          wsSend(socket, 'error', 'auth_failed');
          return; 
        }
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
        const sellerCode = data.sellerCode;
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
        const sellerCode = data.sellerCode;
        const agent = getAgentSocket(sellerCode);
        if (agent && agent.readyState === WebSocket.OPEN) agent.send(JSON.stringify(data));
      }
    } catch (e) { 
      console.error(e);
      if (e instanceof Error) wsSend(socket, 'error', e.message); 
    }
  })
  socket.on('close', () => clearInterval(ping))

  socket.on('error', (error: { message: string, code: string }) => {
    // Проверяем, связана ли ошибка с HMR
    if (error.message?.includes('invalid status code') || 
       error.code === 'WS_ERR_INVALID_CLOSE_CODE') {
       console.warn('WebSocket connection error (handled):', error.message);
     } else {
       console.error('WebSocket connection error:', error);
     }
     // Закрываем проблемное соединение
     try { socket.terminate(); } catch {}
  });
}