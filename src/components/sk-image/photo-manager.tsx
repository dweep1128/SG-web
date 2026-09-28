"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CARD_IMAGE_WIDTH, cld } from "@/lib/cloudinary";
import { discardUpload, fileToJpeg, MAX_PHOTOS, refreshSite, saveMedia, uploadToCloudinary, type Media, type Source } from "@/lib/sk-image";
import { browserSupabase } from "@/lib/supabase";
import { toast, toastError } from "../toast";
import { Badge, Button, CodeTag, EmptyState } from "../ui";
import { Camera, ShotStrip, type Shot } from "./camera";

const PARALLEL_UPLOADS = 2;

type Props = { source: Source; productKey: string; name: string; sku: string; siteHref: string; initialMedia: Media[] };

export function PhotoManager({ source, productKey, name, sku, siteHref, initialMedia }: Props) {
  const supabase = browserSupabase();
  const [media, setMedia] = useState(initialMedia);
  const [shots, setShots] = useState<Shot[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const running = useRef(new Set<number>());
  const nextShotId = useRef(1);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  const sorted = [...media].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const pending = shots.filter((s) => s.status !== "done").length; // failed ones still intend to upload
  const remaining = Math.max(0, MAX_PHOTOS - media.length - pending);
  const inFlight = shots.some((s) => s.status === "queued" || s.status === "uploading");

  const patchShot = (id: number, patch: Partial<Shot>) => setShots((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  // Upload queue: at most PARALLEL_UPLOADS at once. If the DB save fails after the Cloudinary upload, the file is
  // removed from Cloudinary (no orphans) and a retry uploads again; if even that cleanup can't reach the server
  // (offline), the upload is kept so the retry only has to save it.
  useEffect(() => {
    const free = PARALLEL_UPLOADS - running.current.size;
    for (const shot of shots.filter((s) => s.status === "queued" && !running.current.has(s.id)).slice(0, Math.max(0, free))) {
      running.current.add(shot.id);
      patchShot(shot.id, { status: "uploading", error: undefined });
      (async () => {
        let uploaded = shot.uploaded;
        try {
          uploaded ??= await uploadToCloudinary(source, productKey, shot.blob);
          const saved = await saveMedia(supabase, source, productKey, uploaded);
          running.current.delete(shot.id);
          setMedia((list) => [...list, saved]);
          patchShot(shot.id, { status: "done", uploaded });
          refreshSite();
        } catch (e) {
          if (uploaded && (await discardUpload(uploaded.public_id))) uploaded = undefined;
          running.current.delete(shot.id);
          patchShot(shot.id, { status: "failed", uploaded, error: (e as Error).message });
          toastError(`Upload failed: ${(e as Error).message}`);
        }
      })();
    }
  }, [shots, source, productKey, supabase]);

  // Retry failed uploads when the connection comes back.
  useEffect(() => {
    const onOnline = () => setShots((list) => list.map((s) => (s.status === "failed" ? { ...s, status: "queued" } : s)));
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // Closing/reloading the tab would kill in-flight uploads.
  useEffect(() => {
    if (!inFlight) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [inFlight]);

  useEffect(() => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.preview)), []);

  function enqueue(blob: Blob) {
    const shot: Shot = { id: nextShotId.current++, blob, preview: URL.createObjectURL(blob), status: "queued" };
    setShots((list) => [...list, shot]);
  }

  const retry = (id: number) => patchShot(id, { status: "queued" });
  function discard(id: number) {
    const shot = shots.find((s) => s.id === id);
    if (shot?.uploaded) void discardUpload(shot.uploaded.public_id);
    if (shot) URL.revokeObjectURL(shot.preview);
    setShots((list) => list.filter((s) => s.id !== id));
  }

  function closeCamera() {
    setCameraOpen(false);
    // Next camera session starts with an empty strip; finished shots are already in the gallery.
    shots.filter((s) => s.status === "done").forEach((s) => URL.revokeObjectURL(s.preview));
    setShots((list) => list.filter((s) => s.status !== "done"));
  }

  async function onFiles(files: FileList | null) {
    sheetRef.current?.close();
    const list = [...(files ?? [])];
    if (list.length > remaining) toastError(`Only ${remaining} more photo${remaining === 1 ? "" : "s"} allowed. Extra files skipped.`);
    for (const file of list.slice(0, remaining)) {
      try {
        enqueue(await fileToJpeg(file));
      } catch (e) {
        toastError((e as Error).message);
      }
    }
  }

  async function makePrimary(m: Media) {
    setBusyId(m.id);
    const off = await supabase.from("product_media").update({ is_primary: false }).eq("source", source).eq("product_key", productKey).neq("id", m.id);
    const on = off.error ? off : await supabase.from("product_media").update({ is_primary: true }).eq("id", m.id);
    setBusyId(null);
    if (on.error) return toastError(`Could not set cover: ${on.error.message}`);
    setMedia((list) => list.map((x) => ({ ...x, is_primary: x.id === m.id })));
    refreshSite();
    toast("Cover photo set");
  }

  // Swap sort_order with the neighbour.
  async function move(index: number, dir: -1 | 1) {
    const a = sorted[index];
    const b = sorted[index + dir];
    if (!a || !b) return;
    setBusyId(a.id);
    const first = await supabase.from("product_media").update({ sort_order: b.sort_order }).eq("id", a.id);
    const second = first.error ? first : await supabase.from("product_media").update({ sort_order: a.sort_order }).eq("id", b.id);
    setBusyId(null);
    if (second.error) return toastError(`Could not reorder: ${second.error.message}`);
    setMedia((list) => list.map((x) => (x.id === a.id ? { ...x, sort_order: b.sort_order } : x.id === b.id ? { ...x, sort_order: a.sort_order } : x)));
    refreshSite();
  }

  async function remove(m: Media) {
    if (!window.confirm("Delete this photo? This can't be undone.")) return;
    setBusyId(m.id);
    try {
      const res = await fetch("/api/sk-image/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: m.id }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      const server = json.media as Media[];
      // Merge rather than replace, so a photo that finished uploading meanwhile isn't dropped.
      setMedia((list) => list.filter((x) => x.id !== m.id).map((x) => server.find((y) => y.id === x.id) ?? x));
      toast("Photo deleted");
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const locked = busyId !== null;

  return (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <ol>
          <li><Link href="/sk-image">Photos</Link></li>
          <li aria-current="page">#{sku}</li>
        </ol>
      </nav>
      <div className="page__head">
        <div className="detail__tags">
          <CodeTag code={sku} />
          <Badge plain>{source === "busy" ? "BUSY" : "Manual"}</Badge>
        </div>
        <h1 className="sk-title sk-title--product">{name}</h1>
        <p className="sk-stats">
          {media.length} of {MAX_PHOTOS} photos · <Link href={siteHref} target="_blank">View on website</Link>
        </p>
      </div>

      <Button variant="primary" size="lg" block className="sk-add-photo" onClick={() => sheetRef.current?.showModal()} disabled={remaining === 0}>
        {remaining === 0 ? (pending ? "Uploading…" : `Photo limit reached (${MAX_PHOTOS})`) : "Add photo"}
      </Button>

      {!cameraOpen && shots.some((s) => s.status !== "done") && <ShotStrip shots={shots.filter((s) => s.status !== "done")} onRetry={retry} onDiscard={discard} />}

      {sorted.length === 0 ? (
        <EmptyState title="No photos yet">Tap “Add photo” to take or upload up to {MAX_PHOTOS} photos. The first one becomes the cover.</EmptyState>
      ) : (
        <ul className="sk-media" aria-label="Photos">
          {sorted.map((m, i) => (
            <li key={m.id} className="sk-media__item" aria-busy={busyId === m.id}>
              <div className="part-image">
                <Image src={cld(m.url, CARD_IMAGE_WIDTH)} alt={`${name}, photo ${i + 1}`} fill sizes="(max-width: 640px) 50vw, 300px" unoptimized className="part-image__photo" />
              </div>
              {m.is_primary && <span className="badge badge--in sk-media__cover">Cover</span>}
              <div className="sk-media__actions">
                <Button className="sk-icon-btn" onClick={() => move(i, -1)} disabled={locked || i === 0} aria-label="Move left">←</Button>
                <Button className="sk-icon-btn" onClick={() => makePrimary(m)} disabled={locked || m.is_primary} aria-pressed={m.is_primary} aria-label={m.is_primary ? "Cover photo" : "Make cover photo"}>
                  {m.is_primary ? "★" : "☆"}
                </Button>
                <Button className="sk-icon-btn" onClick={() => move(i, 1)} disabled={locked || i === sorted.length - 1} aria-label="Move right">→</Button>
                <Button className="sk-icon-btn sk-icon-btn--danger" onClick={() => remove(m)} disabled={locked} aria-label="Delete photo">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Bottom sheet. Tapping the backdrop (the dialog element itself) closes it. */}
      <dialog ref={sheetRef} className="sk-sheet" aria-label="Add photo" onClick={(e) => e.target === e.currentTarget && sheetRef.current?.close()}>
        <div className="sk-sheet__body">
          <h2 className="sk-sheet__title">Add photo</h2>
          <Button variant="primary" size="lg" block onClick={() => { sheetRef.current?.close(); setCameraOpen(true); }}>Take photo</Button>
          <label className="btn btn--lg btn--block">
            Upload from phone
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <Button variant="ghost" block onClick={() => sheetRef.current?.close()}>Cancel</Button>
        </div>
      </dialog>

      {cameraOpen && <Camera shots={shots} canShoot={remaining > 0} remaining={remaining} onShot={enqueue} onRetry={retry} onDiscard={discard} onClose={closeCamera} />}
    </>
  );
}
