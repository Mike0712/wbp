'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as mediasoupClient from "mediasoup-client";
import { types } from "mediasoup-client";

// -----------------------------
// Types
// -----------------------------

type ControlMessage =
  | { type: "mousemove"; x: number; y: number }
  | { type: "click" }
  | { type: "key"; key: string };

type OutgoingMessage =
  | { type: "join"; data: { sellerCode: string; sid?: string } }
  | { type: "connect"; data: { dtlsParameters: types.DtlsParameters } }
  | { type: "control"; data: ControlMessage };

type WebRtcTransportMsg = {
  type: "webrtctransport";
  data: {
    id: string;
    iceParameters: types.IceParameters;
    iceCandidates: types.IceCandidate[];
    dtlsParameters: types.DtlsParameters;
    rtpCapabilities: types.RtpCapabilities;
  };
};

type ConsumerInfo = {
  id: string;
  producerId: string;
  kind: "audio" | "video";
  rtpParameters: types.RtpParameters;
};

type ConsumersMsg = {
  type: "consumers";
  data: ConsumerInfo[];
};

type ErrorMsg = { type: "error"; data: string };

type IncomingMessage = WebRtcTransportMsg | ConsumersMsg | ErrorMsg;

export interface ClientProps {
  seller?: string;
  sid?: string;
  wsUrl?: string;
}

// -----------------------------
// Component
// -----------------------------

const Client: React.FC<ClientProps> = ({ seller: sellerFromProps, sid: sidFromProps, wsUrl }) => {
  const videoWrapRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const transportRef = useRef<types.Transport | null>(null);
  const deviceRef = useRef<types.Device | null>(null);

  const [status, setStatus] = useState<string>("Connecting...");
  const [error, setError] = useState<string>("");
  const [audioTracks, setAudioTracks] = useState<MediaStreamTrack[]>([]);

  const { sellerCode, sid } = useMemo(() => {
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const code = sellerFromProps || (params?.get("seller") || "0");
    const s = sidFromProps || params?.get("sid") || undefined;
    return { sellerCode: code, sid: s };
  }, [sellerFromProps, sidFromProps]);

  useEffect(() => {
    if (sellerCode === '0') return;
    const proto = typeof window !== "undefined" && window.location?.protocol === "https:" ? "wss" : "ws";
    const url = wsUrl || (typeof window !== "undefined" ? `${proto}://${window.location.host}` : undefined);

    if (!url) {
      setError("WS URL is not defined");
      setStatus("Error");
      return;
    }

    const ws = new WebSocket(url.replace(/^ws:\/\//, "wss://"));
    wsRef.current = ws;

    const send = (msg: OutgoingMessage) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    const attachVideo = (track: MediaStreamTrack) => {
      if (!videoRef.current) return;
      const ms = new MediaStream([track]);
      videoRef.current.srcObject = ms;
      const play = () => {
        videoRef.current?.play().catch(() => {/* user gesture may be required */});
      };
      videoRef.current.onloadedmetadata = play;
      play();
    };

    const handleOpen = () => {
      setStatus("Joining...");
      send({ type: "join", data: { sellerCode, sid } });
    };

    const handleMessage = async (ev: MessageEvent<string>) => {
      try {
        const { type, data } = JSON.parse(ev.data) as IncomingMessage;
        if (type === "webrtctransport") {
          // Device & RecvTransport
          const device = new mediasoupClient.Device();
          deviceRef.current = device;
          await device.load({ routerRtpCapabilities: data.rtpCapabilities });

          const transport = device.createRecvTransport({
            id: data.id,
            iceParameters: data.iceParameters,
            iceCandidates: data.iceCandidates,
            dtlsParameters: data.dtlsParameters,
          });

          transport.on("connect", ({ dtlsParameters }, cb) => {
            send({ type: "connect", data: { dtlsParameters } });
            cb();
          });

          transportRef.current = transport;
          setStatus("Connected. Waiting for media...");
        } else if (type === "consumers") {
          const transport = transportRef.current;
          if (!transport) return;

          const newAudioTracks: MediaStreamTrack[] = [];
          for (const c of data) {
            const consumer = await transport.consume({
              id: c.id,
              producerId: c.producerId,
              kind: c.kind,
              rtpParameters: c.rtpParameters,
            } as types.ConsumerOptions);

            if (c.kind === "video") {
              attachVideo(consumer.track);
            } else {
              newAudioTracks.push(consumer.track);
            }
          }
          setAudioTracks((prev) => [...prev, ...newAudioTracks]);
          setStatus("");
        } else if (type === "error") {
          setError(String((data as unknown as ErrorMsg["data"])));
          setStatus("Error");
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStatus("Error");
      }
    };

    const handleClose = () => setStatus("Disconnected");
    const handleError = () => { setError("WebSocket error"); setStatus("Error"); };

    ws.addEventListener("open", handleOpen);
    ws.addEventListener("message", handleMessage as unknown as EventListener);
    ws.addEventListener("close", handleClose);
    ws.addEventListener("error", handleError);

    // Controls
    const onMouseMove = (e: MouseEvent) => {
      if (!videoRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const r = videoRef.current.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = Math.round(((e.clientX - r.left) / r.width) * 1600);
      const y = Math.round(((e.clientY - r.top) / r.height) * 900);
      send({ type: "control", data: { type: "mousemove", x, y } });
    };

    const onClick = () => send({ type: "control", data: { type: "click" } });
    const onKeyDown = (e: KeyboardEvent) => send({ type: "control", data: { type: "key", key: e.key } });

    const wrap = videoWrapRef.current;
    wrap?.addEventListener("mousemove", onMouseMove);
    wrap?.addEventListener("click", onClick);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      wrap?.removeEventListener("mousemove", onMouseMove);
      wrap?.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKeyDown);

      try { transportRef.current?.close?.(); } catch {}
      try { ws.close(); } catch {}
      transportRef.current = null;
      deviceRef.current = null;
      wsRef.current = null;
    };
  }, [sellerCode, sid, wsUrl]);

  return (
    <div className={`w-full h-full flex flex-col`}>
      <div className="px-3 py-2 text-sm bg-neutral-900 text-neutral-200 flex items-center gap-2">
        <strong>Seller:</strong>
        <code>{sellerCode}</code>
        {status && <em className="ml-3 opacity-70">{status}</em>}
        {error && <span className="ml-3 text-red-400">{error}</span>}
      </div>

      <div
        ref={videoWrapRef}
        className="relative flex-1 bg-black grid place-items-center select-none"
        title="Move mouse/click to send control; press keys to forward key events"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="max-w-full max-h-full outline-none"
        />

        {!error && !videoRef.current?.srcObject && (
          <em className="absolute text-neutral-400">{status || "Waiting for media..."}</em>
        )}

        {audioTracks.map((track, i) => (
          <AudioSink key={i} track={track} />
        ))}
      </div>
    </div>
  );
};

export default Client;

// -----------------------------
// Subcomponents
// -----------------------------

const AudioSink: React.FC<{ track: MediaStreamTrack }> = ({ track }) => {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const ms = new MediaStream([track]);
    ref.current.srcObject = ms;
    ref.current.play?.().catch(() => {});
  }, [track]);
  return <audio ref={ref} autoPlay />;
};
