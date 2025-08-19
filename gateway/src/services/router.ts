import * as mediasoup from 'mediasoup';
import type { types } from 'mediasoup';

let worker: types.Worker;

export const mediaCodecs: types.RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    preferredPayloadType: 111,
    rtcpFeedback: [
      { type: 'transport-cc' }
    ]
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    preferredPayloadType: 102,
    parameters: {
      'packetization-mode': 1,
      'level-asymmetry-allowed': 1,
      'profile-level-id': '42e01f'
    },
    rtcpFeedback: [
      { type: 'nack' },
      { type: 'nack', parameter: 'pli' },
      { type: 'ccm', parameter: 'fir' },
      { type: 'goog-remb' },
      { type: 'transport-cc' }
    ]
  }
];


const RTP_MIN_PORT = Number(process.env.RTP_MIN_PORT);
const RTP_MAX_PORT = Number(process.env.RTP_MAX_PORT);

const router = async (): Promise<types.Router> => {
    worker = await mediasoup.createWorker({ rtcMinPort: RTP_MIN_PORT, rtcMaxPort: RTP_MAX_PORT });
    worker.on('died', () => { console.error('mediasoup worker died'); process.exit(1); });

    const r = await worker.createRouter({
        mediaCodecs
    });
    return r;
}

export default router;
