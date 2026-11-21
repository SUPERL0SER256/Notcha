import { useEffect, useRef, useState } from "react";
import { ImageSquare, PencilSimple, Trash } from "@phosphor-icons/react";
import { createStore } from "../../lib/store";
import { holdOpen } from "../../notch/useNotchState";
import { personaImage, snap } from "../../platform/services";
import { t } from "../../i18n";

interface CardPrefs {
  name: string;
  quote: string;
}

/** Tiny text-only store (~80 B in localStorage); the photo/GIF lives on disk in AppData. */
const cardStore = createStore<CardPrefs>(
  {
    name: "Notcha",
    quote: "Take a breath. Make something cool.",
  },
  { persist: "vibe-card" },
);

/** Reads an uploaded photo or GIF into a data URL. Downscales large static images to 720 px; keeps GIFs animated. */
async function readImageFile(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  if (file.type === "image/gif" || file.size < 350_000) return raw;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const max = 720;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(raw);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => resolve(raw);
    img.src = raw;
  });
}

export function CardView() {
  const prefs = cardStore.use();
  // Kept only in component state so it's garbage-collected when the notch closes (0 idle RAM).
  const [image, setImage] = useState<string | null>(null);
  const [editing, setEditing] = useState<"name" | "quote" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const picking = useRef(false);

  const endPick = () => {
    if (!picking.current) return;
    picking.current = false;
    holdOpen(false);
  };

  useEffect(() => () => endPick(), []);

  // Load saved image lazily from disk (and migrate any legacy localStorage image to disk once).
  useEffect(() => {
    let alive = true;
    const legacy = (cardStore.get() as CardPrefs & { image?: string | null }).image;
    if (legacy) {
      setImage(legacy);
      void personaImage.save(legacy).then(() => {
        cardStore.set(({ name, quote }) => ({ name, quote }));
      });
      return () => {
        alive = false;
      };
    }
    void personaImage
      .load()
      .then((url) => {
        if (alive) setImage(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const saveImage = async (dataUrl: string) => {
    setImage(dataUrl);
    await personaImage.save(dataUrl);
  };

  const clearImage = () => {
    setImage(null);
    void personaImage.clear();
  };

  // Ctrl+V while on Persona pastes an image directly from the clipboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && e.key.toLowerCase() === "v")) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      void snap
        .fromClipboard()
        .then((res) => saveImage(res.dataUrl))
        .catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openPicker = () => {
    if (!picking.current) {
      picking.current = true;
      holdOpen(true);
    }
    const onFocusBack = () => window.setTimeout(endPick, 400);
    window.addEventListener("focus", onFocusBack, { once: true });
    fileInput.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    try {
      if (!file || !file.type.startsWith("image/")) return;
      const dataUrl = await readImageFile(file);
      await saveImage(dataUrl);
    } catch {
      // Ignore unreadable files.
    } finally {
      endPick();
    }
  };

  return (
    <div className="flex h-full flex-col px-4 pt-1 pb-2">
      <div
        className="flex min-h-0 flex-1 items-center gap-3.5 overflow-hidden rounded-[14px] bg-black p-2.5"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void onFile(e.dataTransfer.files[0]);
        }}
      >
        {/* Left: Wide landscape photo / GIF frame */}
        <div
          className={`group relative h-full w-[64%] shrink-0 overflow-hidden rounded-[11px] bg-black ${
            image ? "" : "border border-white/10"
          }`}
        >
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {image ? (
            <>
              <img src={image} alt="" draggable={false} className="size-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/50 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={openPicker}
                  title={t("Bild ändern")}
                  className="pressable flex size-7 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
                >
                  <ImageSquare size={14} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={clearImage}
                  title={t("Entfernen")}
                  className="pressable flex size-7 items-center justify-center rounded-full bg-white/15 text-white hover:bg-red/80"
                >
                  <Trash size={14} weight="bold" />
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={openPicker}
              className="flex size-full flex-col items-center justify-center gap-1.5 px-2 text-center text-label-3 transition-colors hover:bg-white/[0.05] hover:text-label-2"
            >
              <ImageSquare size={24} weight="duotone" />
              <span className="text-caption">{t("Foto oder GIF")}</span>
            </button>
          )}
        </div>

        {/* Right: Minimal inline-editable title & quote */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 pr-1">
          <div>
            {editing === "name" ? (
              <input
                autoFocus
                value={prefs.name}
                maxLength={28}
                onChange={(e) => cardStore.set((p) => ({ ...p, name: e.target.value }))}
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && setEditing(null)}
                className="w-full bg-transparent text-[26px] leading-tight font-bold tracking-[-0.03em] text-label outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing("name")}
                className="group flex max-w-full items-center gap-1.5 text-left"
              >
                <span className="truncate text-[26px] leading-tight font-bold tracking-[-0.03em] text-label">
                  {prefs.name || t("Dein Name")}
                </span>
                <PencilSimple size={11} weight="bold" className="shrink-0 text-label-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
          </div>

          <div>
            {editing === "quote" ? (
              <textarea
                autoFocus
                rows={3}
                maxLength={110}
                value={prefs.quote}
                onChange={(e) => cardStore.set((p) => ({ ...p, quote: e.target.value }))}
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    setEditing(null);
                  } else if (e.key === "Escape") {
                    setEditing(null);
                  }
                }}
                className="w-full resize-none bg-transparent text-footnote leading-snug text-label-2 outline-none [scrollbar-width:none]"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing("quote")}
                className="group flex w-full items-start gap-1.5 text-left"
              >
                <span className="line-clamp-3 text-footnote leading-snug text-label-2">
                  {prefs.quote || t("Zitat oder Status hinzufügen …")}
                </span>
                <PencilSimple size={11} weight="bold" className="mt-0.5 shrink-0 text-label-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
