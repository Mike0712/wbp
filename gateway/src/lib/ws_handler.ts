import WebSocket from 'ws';
import router from '@/services/router';
import sellers from '@/services/sellers';

const AUTH_BASE = process.env.AUTH_BASE;


function wsSend(ws: WebSocket, type: string, data: string | object) { try { ws.send(JSON.stringify({ type, data })); } catch {} }

async function validateSid({ sid, sellerCode }: {sid: string, sellerCode: string}) {
  const u = new URL('/auth/validate', AUTH_BASE);
  u.searchParams.set('sid', sid);
  u.searchParams.set('seller', sellerCode);
  const r = await fetch(u.toString());
  if (!r.ok) return { ok:false };
  return r.json();
}

export const handleWs = async (socket: WebSocket) => {
  let transportRecv: null | object, sellerCode;
  socket.on('message', async (msg: string) => {
    const { type, data } = JSON.parse(msg.toString());
    try {
      if (type === 'join') {
        const sellerCode = data.sellerCode;
        const sid = data.sid;
        const v = await validateSid({ sid, sellerCode });
        if (!v.ok) { wsSend(socket, 'error', 'auth_failed'); return; }

        const s = sellers.get(sellerCode);
        if (!s || !s.videoProducer) { wsSend(socket, 'error', 'stream_not_ready'); return; }
        const r = await router();
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
        await transportRecv.connect({ dtlsParameters: data.dtlsParameters });
        wsSend(ws, 'connected', true);
        const s = sellers.get(sellerCode);
        const consumers = [];
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
        const agent = getAgentSocket(sellerCode);
        if (agent && agent.readyState === WebSocket.OPEN) agent.send(JSON.stringify(data));
      }
    } catch (e) { console.error(e); wsSend(ws, 'error', e.message); }
  })
}