"use client";
import { useEffect, useRef, useState } from "react";
import { fileToJpeg, toJpeg, type Uploaded } from "@/lib/sk-image";
import { toastError } from "../toast";

export type Shot = { id: number; blob: Blob; preview: string; status: "queued" | "uploading" | "done" | "failed"; uploaded?: Uploaded; error?: string };

const HAPTIC_MS = 40;

// Plain-language fixes for the ways getUserMedia fails on phones.
function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera access is blocked. Tap the lock (or ⓘ) icon next to the address bar → Permissions → Camera → Allow, then reload. On iPhone: Settings → Safari → Camera → Allow.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device.";
  if (name === "NotReadableError") return "The camera is busy in another app. Close that app and try again.";
  return `The camera could not start${name ? ` (${name})` : ""}.`;
}

type Props = {
  shots: Shot[];
  canShoot: boolean;
  remaining: number;
  onShot: (blob: Blob) => void;
  onRetry: (id: number) => void;
  onDiscard: (id: number) => void;
  onClose: () => void;
};

// Full-screen in-browser camera. Frames go video → canvas → JPEG blob → upload, all in memory: no file input,
// nothing written to disk, so nothing lands in the phone's gallery.
export function Camera({ shots, canShoot, remaining, onShot, onRetry, onDiscard, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [flashes, setFlashes] = useState(0); // re-keys the flash overlay so the animation replays per shot

  useEffect(() => {
    if (!window.isSecureContext) {
      setError("The camera only works over a secure connection. Open this page with its https:// address.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't open the camera.");
      return;
    }
    let stream: MediaStream | undefined;
    let closed = false;
    setReady(false);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (closed) return s.getTracks().forEach((t) => t.stop()); // unmounted while the permission prompt was open
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((e) => setError(cameraError(e)));
    return () => {
      closed = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  async function shoot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !canShoot) return;
    navigator.vibrate?.(HAPTIC_MS);
    setFlashes((n) => n + 1);
    try {
      onShot(await toJpeg(v, v.videoWidth, v.videoHeight));
    } catch (e) {
      toastError((e as Error).message);
    }
  }

  async function fromNativeCamera(file: File | undefined) {
    if (!file) return;
    try {
      onShot(await fileToJpeg(file));
    } catch (e) {
      toastError((e as Error).message);
    }
  }

  // Returns false if the user chose to stay.
  function confirmClose(): boolean {
    const inFlight = shots.filter((s) => s.status === "queued" || s.status === "uploading").length;
    return !inFlight || window.confirm(`${inFlight} photo${inFlight === 1 ? " is" : "s are"} still uploading. They keep going after you close the camera, but stay on this page until they finish. Close the camera?`);
  }

  // Phone Back button: the camera owns one history entry, so Back closes the camera (same warning) instead of
  // leaving the page and killing uploads. Next.js keeps its router state on native pushState, so this is safe.
  const leaving = useRef(false);
  const confirmCloseRef = useRef(confirmClose);
  confirmCloseRef.current = confirmClose;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    window.history.pushState(null, "", window.location.href);
    const onBack = () => {
      if (leaving.current) return;
      if (confirmCloseRef.current()) onCloseRef.current();
      else window.history.pushState(null, "", window.location.href); // stayed: re-arm Back
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);

  function close() {
    if (!confirmClose()) return;
    leaving.current = true;
    window.history.back(); // drop the camera's history entry
    onClose();
  }

  return (
    <div className="sk-cam" role="dialog" aria-modal="true" aria-label="Camera">
      <div className="sk-cam__top">
        <span className="sk-cam__left">{canShoot ? `${remaining} more allowed` : "Photo limit reached (8)"}</span>
        <button type="button" className="btn btn--accent sk-cam__done" onClick={close}>Done</button>
      </div>

      <div className="sk-cam__view">
        {error ? (
          <div className="sk-cam__error" role="alert">
            <p className="sk-cam__error-title">Camera unavailable</p>
            <p>{error}</p>
            <label className={`btn btn--accent btn--lg btn--block${canShoot ? "" : " btn--disabled"}`} aria-disabled={!canShoot}>
              Use the phone camera instead
              <input type="file" accept="image/*" capture="environment" hidden disabled={!canShoot} onChange={(e) => { void fromNativeCamera(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
        ) : (
          <video ref={videoRef} className={facing === "user" ? "sk-cam__video sk-cam__video--mirror" : "sk-cam__video"} autoPlay playsInline muted onLoadedMetadata={() => setReady(true)} />
        )}
        {flashes > 0 && <div key={flashes} className="sk-cam__flash" aria-hidden="true" />}
      </div>

      <ShotStrip shots={shots} onRetry={onRetry} onDiscard={onDiscard} />

      <div className="sk-cam__controls">
        <span />
        <button type="button" className="sk-cam__shutter" onClick={shoot} disabled={!ready || !canShoot || !!error} aria-label="Take photo" />
        <button type="button" className="sk-cam__flip" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} disabled={!!error} aria-label="Switch camera">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" /></svg>
        </button>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<Shot["status"], string> = { queued: "Waiting to upload", uploading: "Uploading", done: "Uploaded", failed: "Upload failed, tap to retry" };

// One thumbnail per shot/file with its upload state. Failed ones retry on tap.
export function ShotStrip({ shots, onRetry, onDiscard }: { shots: Shot[]; onRetry: (id: number) => void; onDiscard: (id: number) => void }) {
  if (!shots.length) return null;
  return (
    <ul className="sk-strip" aria-label="Uploads">
      {shots.map((s) => (
        <li key={s.id} className={`sk-strip__item sk-strip__item--${s.status}`}>
          <button type="button" className="sk-strip__thumb" disabled={s.status !== "failed"} onClick={() => onRetry(s.id)} aria-label={STATUS_LABEL[s.status]} title={s.error}>
            {/* eslint-disable-next-line @next/next/no-img-element -- in-memory blob: URL, nothing for next/image to optimise */}
            <img src={s.preview} alt="" />
            <span className="sk-strip__state" aria-hidden="true">
              {s.status === "done" ? "✓" : s.status === "failed" ? "↻" : <span className="sk-spinner" />}
            </span>
          </button>
          {s.status === "failed" && (
            <button type="button" className="sk-strip__discard" onClick={() => onDiscard(s.id)} aria-label="Discard this photo">×</button>
          )}
        </li>
      ))}
    </ul>
  );
}
