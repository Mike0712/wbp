import type { NextApiRequest, NextApiResponse } from 'next';
import sellers from '@/services/sellers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const code = String(req.query.sellerCode);

  switch (req.method) {
    case 'GET':
        res.status(200).json({ ok: true, sellers });
    case 'POST':
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
    default:
      res.status(405).end();
  }
}