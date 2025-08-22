import type { NextApiRequest, NextApiResponse } from 'next';
import sellers from '@/services/sellers';
import r from '@/services/router';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
        res.json({ ok: true, sellers });
    case 'POST':
        const code = String(req.query.sellerCode);

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
    default:
      res.status(405).end();
  }
}