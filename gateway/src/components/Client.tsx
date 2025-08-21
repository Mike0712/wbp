'use client';

import { useEffect, useRef, useState } from 'react';
import * as mediasoupClient from 'mediasoup-client';
import { types } from 'mediasoup-client';

type Props = {
  seller: string;
  sid: string;
  wsPath?: string; // по умолчанию '/ws'
  className?: string;
  style?: React.CSSProperties;
};

export default function Client({ seller, sid, wsPath = '/ws', className, style }: Props) {
  const [status, setStatus] = useState('init');
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (window !== undefined) {
        setMounted(true);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!seller || !sid) { setStatus('missing params'); return; }

    let ws: WebSocket | null = null;
    let device: mediasoupClient.types.Device | null = null;
    let recvTransport: mediasoupClient.types.Transport | null = null;
    const consumers: mediasoupClient.types.Consumer[] = [];

    const cleanup = () => {
      try { consumers.forEach(c => { try { c.close(); } catch {} }); } catch {}
      try { recvTransport?.close(); } catch {}
      try { ws?.close(); } catch {}
    };

    const attachVideo = (track: MediaStreamTrack) => {
      if (!videoRef.current) {
        const v = document.createElement('video');
        v.autoplay = true; v.playsInline = true;
        videoRef.current = v;
        if (wrapRef.current) {
          wrapRef.current.innerHTML = '';
          wrapRef.current.appendChild(v);
        }
      }
      videoRef.current!.srcObject = new MediaStream([track]);
    };

    const attachAudio = (track: MediaStreamTrack) => {
      const a = document.createElement('audio');
      a.autoplay = true;
      a.srcObject = new MediaStream([track]);
      wrapRef.current?.appendChild(a);
    };

    (async () => {
      try {
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = `${proto}://${window.location.host}/ws`;
        setStatus('connecting ws…');
        ws = new WebSocket(wsUrl);

        const send = (type: string, data: object) => {
          try { ws?.send(JSON.stringify({ type, data })); } catch {}
        };

        ws.onopen = () => {
          setStatus('ws open');
          send('join', { sellerCode: seller, sid });
        };

        ws.onmessage = async (ev) => {
          const { type, data } = JSON.parse(ev.data);
          console.log(type, data);

          if (type === 'error') {
            setStatus(`error: ${data}`);
            return;
          }

          if (type === 'webrtctransport') {
            try {
              setStatus('loading device…');
              device = new mediasoupClient.Device();
              await device.load({ routerRtpCapabilities: data.rtpCapabilities });

              recvTransport = device.createRecvTransport({
                id: data.id,
                iceParameters: data.iceParameters,
                iceCandidates: data.iceCandidates,
                dtlsParameters: data.dtlsParameters
              });

              recvTransport.on('connect', ({ dtlsParameters }, cb) => {
                send('connect', { dtlsParameters });
                cb();
              });

              setStatus('transport ready');
            } catch (e) {
              setStatus(`device failed: ${e instanceof Error ? e.message : 'unknown'}`);
            }
          }

          if (type === 'consumers') {
            setStatus('consuming…');
            for (const c of data as types.Consumer[]) {
              if (!recvTransport) continue;
              const consumer = await recvTransport.consume({
                id: c.id,
                producerId: c.producerId,
                kind: c.kind,
                rtpParameters: c.rtpParameters
              });
              consumers.push(consumer);
              if (c.kind === 'video') attachVideo(consumer.track);
              else attachAudio(consumer.track);
            }
            setStatus('playing');
          }
        };

        ws.onerror = () => setStatus('ws error');
        ws.onclose = () => setStatus('ws closed');
      } catch (e) {
        setStatus(`failed: ${e instanceof Error ? e.message : 'unknown'}`);
      }

      return cleanup;
    })();

    return () => { /* cleanup в IIFE */ };
  }, [mounted, seller, sid, wsPath]);

  // Пока не смонтировались — рендерим стабильный плейсхолдер (никаких window/случайностей)
  if (!mounted) {
    return (
      <div className={className} style={{ display:'flex', flexDirection:'column', height:'100%', ...style }}>
        <div style={{ padding: 8, background: '#f5f5f5', display:'flex', gap:8, alignItems:'center' }}>
          <strong>Seller:</strong> <code>{seller}</code>
          <span style={{ opacity: .7 }} suppressHydrationWarning> · init</span>
        </div>
        <div style={{ flex: 1, background: '#111', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <em style={{ color:'#bbb' }}>Connecting…</em>
        </div>
      </div>
    );
  }

  return (
    <div className={className} style={{ display:'flex', flexDirection:'column', height:'100%', ...style }}>
      <div style={{ padding: 8, background: '#f5f5f5', display:'flex', gap:8, alignItems:'center' }}>
        <strong>Seller:</strong> <code>{seller}</code>
        <span style={{ opacity: .7 }} suppressHydrationWarning> · {status}</span>
      </div>
      <div
        ref={wrapRef}
        style={{ flex: 1, background: '#111', display:'flex', alignItems:'center', justifyContent:'center' }}
      >
        <em style={{ color:'#bbb' }}>Connecting…</em>
      </div>
    </div>
  );
}
