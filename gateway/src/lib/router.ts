import * as mediasoup from 'mediasoup';

const RTP_MIN_PORT = Number(process.env.RTP_MIN_PORT);
const RTP_MAX_PORT = Number(process.env.RTP_MAX_PORT);

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

let router: mediasoup.types.Router | null = null;

export const getRouter = async () => {
    if (router) return router;
    router = await r();
    return router;
}