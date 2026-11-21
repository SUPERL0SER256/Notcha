import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp,
  Camera,
  Check,
  ClipboardText,
  Copy,
  Crop,
  FloppyDisk,
  FolderOpen,
  Lightbulb,
  Monitor,
  Sparkle,
  Stop,
  TextT,
  Wrench,
  X,
  type Icon,
} from "@phosphor-icons/react";
import { content, fade, springs } from "../../design/motion";
import { createStore } from "../../lib/store";
import { HeaderActions, HeaderButton } from "../../notch/header";
import { navigate } from "../../notch/nav";
import { revealFile, snap, type SnapResult } from "../../platform/services";
import { settings } from "../../settings/store";
import { providerInfo, streamChat, type ChatMessage } from "../ask/providers";
import { t, tBackend } from "../../i18n";

interface SnapState {
  shot: SnapResult | null;
  messages: ChatMessage[];
  savedPath: string | null;
}

const snapStore = createStore<SnapState>({ shot: null, messages: [], savedPath: null });

const quickActions: { icon: Icon; label: string; prompt: string }[] = [
  { icon: Lightbulb, label: "Erklären", prompt: "Explain what is shown in this screenshot concisely and directly." },
  { icon: TextT, label: "Text kopieren", prompt: "Extract all visible text from this screenshot cleanly with no extra commentary." },
  { icon: Wrench, label: "Lösen", prompt: "Identify any question, error, or problem in this screenshot and give the direct solution." },
];

export function SnapView() {
  const { shot, messages, savedPath } = snapStore.use();
  const provider = settings.use().ask.provider;
  const [busy, setBusy] = useState<"region" | "screen" | "clip" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => abort.current?.abort(), []);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages]);

  // Ctrl+V while on Snap pulls an image straight from the clipboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && e.key.toLowerCase() === "v")) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      void take("clip");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const take = async (mode: "region" | "screen" | "clip") => {
    if (busy) return;
    setBusy(mode);
    setError(null);
    try {
      const res =
        mode === "region"
          ? await snap.captureRegion()
          : mode === "screen"
            ? await snap.captureScreen()
            : await snap.fromClipboard();
      if (res) {
        abort.current?.abort();
        snapStore.set({ shot: res, messages: [], savedPath: null });
        setExpanded(false);
      }
    } catch (e) {
      setError(tBackend(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  };

  const askShot = async (text: string) => {
    const prompt = text.trim();
    const currentShot = snapStore.get().shot;
    if (!prompt || !currentShot || streaming) return;
    setDraft("");
    setError(null);
    const prev = snapStore.get().messages;
    // Attach the screenshot on the first user turn so follow-ups stay lightweight.
    const userMsg: ChatMessage = prev.length === 0 ? { role: "user", content: prompt, imageBase64: currentShot.base64 } : { role: "user", content: prompt };
    const history: ChatMessage[] = [...prev, userMsg];
    snapStore.set((s) => ({ ...s, messages: [...history, { role: "assistant", content: "" }] }));
    setStreaming(true);
    abort.current = new AbortController();
    try {
      await streamChat(
        provider,
        history,
        (delta) => {
          snapStore.set((s) => {
            const next = [...s.messages];
            const last = next[next.length - 1];
            if (last) next[next.length - 1] = { ...last, content: last.content + delta };
            return { ...s, messages: next };
          });
        },
        abort.current.signal,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg === "no-key" ? t("Kein API-Schlüssel für {p} – in den Einstellungen eintragen.", { p: providerInfo[provider].label }) : tBackend(msg));
      snapStore.set((s) => ({ ...s, messages: s.messages.at(-1)?.content === "" ? s.messages.slice(0, -1) : s.messages }));
    } finally {
      setStreaming(false);
    }
  };

  const copyShot = async () => {
    if (!shot) return;
    await snap.copy(shot.base64);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const saveShot = async () => {
    if (!shot) return;
    try {
      const path = await snap.save(shot.base64);
      snapStore.set((s) => ({ ...s, savedPath: path }));
    } catch (e) {
      setError(tBackend(e instanceof Error ? e.message : String(e)));
    }
  };

  const clear = () => {
    abort.current?.abort();
    snapStore.set({ shot: null, messages: [], savedPath: null });
    setError(null);
    setExpanded(false);
  };

  return (
    <div className="flex h-full flex-col px-4 pt-1 pb-2">
      <HeaderActions>
        <button
          onClick={() => navigate("settings", "ask")}
          title={t("Anbieter in den Einstellungen ändern")}
          className="mr-1 max-w-36 truncate text-caption text-label-3 hover:text-label-2"
        >
          {providerInfo[provider].label}
        </button>
        {shot && (
          <>
            <HeaderButton label={t("Bereich aufnehmen")} disabled={!!busy} onClick={() => void take("region")}>
              <Crop size={14} weight="bold" />
            </HeaderButton>
            <HeaderButton label={t("Vollbild aufnehmen")} disabled={!!busy} onClick={() => void take("screen")}>
              <Monitor size={14} weight="bold" />
            </HeaderButton>
            <HeaderButton label={copied ? t("Kopiert") : t("Kopieren")} onClick={() => void copyShot()}>
              {copied ? <Check size={14} weight="bold" className="text-green" /> : <Copy size={14} weight="bold" />}
            </HeaderButton>
            {savedPath ? (
              <HeaderButton label={t("Im Explorer zeigen")} onClick={() => revealFile(savedPath)}>
                <FolderOpen size={14} weight="bold" className="text-green" />
              </HeaderButton>
            ) : (
              <HeaderButton label={t("Speichern")} onClick={() => void saveShot()}>
                <FloppyDisk size={14} weight="bold" />
              </HeaderButton>
            )}
            <HeaderButton label={t("Leeren")} onClick={clear}>
              <X size={14} weight="bold" />
            </HeaderButton>
          </>
        )}
      </HeaderActions>

      {!shot ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-fill-1 text-label-2">
            <Camera size={22} weight="bold" />
          </div>
          <div className="text-center">
            <p className="text-body font-medium text-label">{t("Screenshot aufnehmen & fragen")}</p>
            <p className="mt-0.5 text-caption text-label-3">{t("Bereich auswählen, Vollbild erfassen oder mit Strg+V einfügen")}</p>
          </div>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <CaptureButton icon={Crop} label={busy === "region" ? t("Warte auf Auswahl …") : t("Bereich")} primary disabled={!!busy} onClick={() => void take("region")} />
            <CaptureButton icon={Monitor} label={busy === "screen" ? t("Nehme auf …") : t("Vollbild")} disabled={!!busy} onClick={() => void take("screen")} />
            <CaptureButton icon={ClipboardText} label={t("Zwischenablage")} disabled={!!busy} onClick={() => void take("clip")} />
          </div>
          {error && <p className="mt-1 text-caption text-orange">{error}</p>}
        </div>
      ) : (
        <>
          {/* Screenshot thumbnail strip (click to expand/collapse) */}
          <motion.button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            layout
            transition={springs.snappy}
            className={`group relative mb-2 flex w-full shrink-0 items-center gap-2.5 overflow-hidden rounded-[12px] bg-fill-1 text-left transition-colors hover:bg-fill-2 ${
              expanded ? "h-44 justify-center p-2" : "h-14 px-2 py-1.5"
            }`}
          >
            <img
              src={shot.dataUrl}
              alt=""
              draggable={false}
              className={expanded ? "max-h-full max-w-full rounded-[8px] object-contain" : "h-full w-20 shrink-0 rounded-[7px] bg-black/40 object-cover"}
            />
            {!expanded && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-footnote font-medium text-label">
                  <Sparkle size={12} weight="fill" className="text-label-2" />
                  <span>{t("Screenshot bereit")}</span>
                </div>
                <div className="tabular text-caption text-label-3">
                  {shot.width} × {shot.height} · {t("Klicken zum Vergrößern")}
                </div>
              </div>
            )}
          </motion.button>

          {/* AI response area or quick prompts */}
          <div ref={list} className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2.5">
                <span className="text-caption text-label-3">{t("Schnellaktionen für diesen Screenshot")}</span>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {quickActions.map((q) => (
                    <button
                      key={q.label}
                      onClick={() => void askShot(q.prompt)}
                      className="pressable pressable-fill flex h-7 items-center gap-1.5 rounded-full bg-fill-1 px-3 text-footnote text-label-2 hover:text-label"
                    >
                      <q.icon size={13} weight="bold" /> {t(q.label)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 pb-1">
                {messages.map((m, i) => (
                  <SnapBubble key={i} message={m} streaming={streaming && i === messages.length - 1} />
                ))}
              </div>
            )}
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                className="mb-1 text-caption text-orange"
                initial={{ opacity: 0, transform: "translateY(2px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                exit={{ opacity: 0 }}
                transition={fade}
              >
                {error}{" "}
                <button onClick={() => navigate("settings", "ask")} className="underline underline-offset-2 hover:text-label">
                  {t("Einstellungen")}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <form
            className="mt-1 flex items-end gap-2 rounded-[16px] bg-fill-1 py-1.5 pr-1.5 pl-3"
            onSubmit={(e) => {
              e.preventDefault();
              void askShot(draft);
            }}
          >
            <textarea
              ref={input}
              value={draft}
              rows={1}
              placeholder={t("Frag etwas zu diesem Screenshot …")}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 54)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void askShot(draft);
                }
              }}
              className="max-h-[54px] min-h-[18px] flex-1 resize-none bg-transparent py-0.5 text-body text-label outline-none [scrollbar-width:none] placeholder:text-label-4"
            />
            {streaming ? (
              <button type="button" aria-label={t("Stopp")} onClick={() => abort.current?.abort()} className="pressable flex size-6 shrink-0 items-center justify-center rounded-full bg-fill-3 text-label">
                <Stop size={11} weight="fill" />
              </button>
            ) : (
              <button
                type="submit"
                aria-label={t("Senden")}
                disabled={!draft.trim()}
                className="pressable flex size-6 shrink-0 items-center justify-center rounded-full bg-label text-black transition-opacity duration-150 disabled:opacity-25"
              >
                <ArrowUp size={13} weight="bold" />
              </button>
            )}
          </form>
        </>
      )}
    </div>
  );
}

function CaptureButton({ icon: I, label, primary, disabled, onClick }: { icon: Icon; label: string; primary?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`pressable flex h-8 items-center gap-1.5 rounded-full px-3.5 text-footnote font-medium transition-colors disabled:opacity-40 ${
        primary ? "bg-label text-black" : "bg-fill-1 text-label-2 hover:bg-fill-2 hover:text-label"
      }`}
    >
      <I size={14} weight="bold" />
      {label}
    </button>
  );
}

function SnapBubble({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  const [copied, setCopied] = useState(false);
  const user = message.role === "user";
  return (
    <motion.div
      className={`group flex ${user ? "justify-end" : "justify-start"}`}
      initial={{ opacity: 0, transform: "translateY(4px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={content.enter}
    >
      <div
        className={`relative max-w-[88%] text-body whitespace-pre-wrap ${
          user ? "rounded-[14px] rounded-br-[4px] bg-fill-2 px-3 py-1.5 text-label" : "px-1 text-label-2"
        }`}
      >
        {message.content}
        {streaming && <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] animate-pulse bg-label-2" />}
        {!user && !streaming && message.content && (
          <button
            aria-label={t("Kopieren")}
            onClick={() => {
              void navigator.clipboard.writeText(message.content);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="pressable mt-1 flex items-center gap-1 text-caption text-label-4 opacity-0 group-hover:opacity-100 hover:text-label-2"
          >
            {copied ? <Check size={11} weight="bold" /> : <Copy size={11} weight="bold" />} {copied ? t("Kopiert") : t("Kopieren")}
          </button>
        )}
      </div>
    </motion.div>
  );
}
