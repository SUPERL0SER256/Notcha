import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isNative } from "./native";
import bundledChangelog from "../changelog.json";
import { showcase, showcaseFileSizes } from "../dev/showcase-data";

/*
 * Bridges to the Rust services (src-tauri/src/*.rs). In the browser they return
 * sample data so every tool can be designed without the app.
 */

// ---------- Secrets (Credential Manager) ----------

export type SecretName = "ai.gemini" | "ai.openai" | "ai.anthropic";

const mockSecrets = new Map<SecretName, string>();

export const secrets = {
  has: (name: SecretName): Promise<boolean> =>
    isNative ? invoke<boolean>("secret_has", { name }) : Promise.resolve(mockSecrets.has(name)),
  set: (name: SecretName, value: string): Promise<void> => {
    if (isNative) return invoke("secret_set", { name, value });
    if (value.trim()) mockSecrets.set(name, value.trim());
    else mockSecrets.delete(name);
    return Promise.resolve();
  },
};

/** Opens an https:// link in the default browser. */
export function openUrl(url: string) {
  if (isNative) void invoke("open_url", { url });
  else window.open(url, "_blank", "noopener,noreferrer");
}

// ---------- System ----------

export interface SystemStats {
  cpu: number;
  cpuName: string;
  memUsed: number;
  memTotal: number;
  /** null = no GPU counters. */
  gpu: number | null;
  gpuName: string | null;
  gpuMemUsed: number;
  gpuMemTotal: number;
  /** ms; null = no reply. */
  ping: number | null;
}

let mock = { cpu: 18, gpu: 32, ping: 14 };
/** `full = false`: CPU and RAM only (GPU and ping come back as null / 0). */
export function fetchSystem(full: boolean): Promise<SystemStats> {
  if (isNative) return invoke<SystemStats>("system_stats", { full });
  const walk = (v: number, step: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v + (Math.random() - 0.5) * step));
  mock = { cpu: walk(mock.cpu, 14, 3, 96), gpu: walk(mock.gpu, 18, 0, 99), ping: walk(mock.ping, 6, 8, 60) };
  const gb = 1024 ** 3;
  return Promise.resolve({
    cpu: mock.cpu,
    cpuName: "Ryzen 7 7800X3D 8-Core",
    memUsed: 13.4 * gb + Math.random() * 0.3 * gb,
    memTotal: 32 * gb,
    gpu: full ? mock.gpu : null,
    gpuName: "GeForce RTX 4070 Ti",
    gpuMemUsed: full ? 2.9 * gb + (mock.gpu / 100) * 3 * gb : 0,
    gpuMemTotal: 12 * gb,
    ping: full ? Math.round(mock.ping) : null,
  });
}

// ---------- Converter ----------

export type FileKind = "image" | "audio" | "video" | "document" | "table" | "other";

export interface DroppedFile {
  path: string;
  name: string;
  kind: FileKind;
  ext: string;
  size: number;
}

export interface ConvertResult {
  input: string;
  output: string | null;
  error: string | null;
}

export function probeFiles(paths: string[]): Promise<{ files: DroppedFile[]; ffmpeg: boolean }> {
  if (isNative) return invoke("convert_probe", { paths });
  // Browser: paths are made-up names from the drop event.
  const files = paths.map((p) => {
    const name = p.split(/[\\/]/).pop() ?? p;
    const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
    const kind: FileKind = /^(png|jpe?g|webp|bmp|gif|ico|tiff?|dds|tga)$/.test(ext)
      ? "image"
      : /^(mp3|wav|flac|m4a|aac|ogg|opus)$/.test(ext)
        ? "audio"
        : /^(mp4|mov|mkv|avi|webm)$/.test(ext)
          ? "video"
          : /^(txt|md|markdown|html?|pdf|docx)$/.test(ext)
            ? "document"
            : /^(xlsx|xlsm|xls|ods|csv|tsv)$/.test(ext)
              ? "table"
              : "other";
    return { path: p, name, kind, ext, size: (showcase && showcaseFileSizes[name]) || 1_400_000 + name.length * 91_000 };
  });
  return Promise.resolve({ files, ffmpeg: false });
}

export function convertFiles(paths: string[], target: string, quality: number, maxSize: number | null): Promise<ConvertResult[]> {
  if (isNative) return invoke("convert_files", { paths, target, quality, maxSize });
  return new Promise((r) =>
    setTimeout(
      () =>
        r(
          paths.map((input) => {
            const ext = input.split(".").pop()?.toLowerCase();
            if (ext === target) return { input, output: null, error: "Ist schon in diesem Format" };
            return { input, output: input.replace(/\.[^.]+$/, `.${target}`), error: null };
          }),
        ),
      900,
    ),
  );
}

export function revealFile(path: string) {
  if (isNative) void invoke("reveal_file", { path });
}

// ---------- Updates ----------

/** A found update: version + install (downloads, installs, restarts). */
export interface UpdateHandle {
  version: string;
  install: (onProgress: (fraction: number) => void) => Promise<void>;
}

/** What changed in a version (`src/changelog.json`, newest first). */
export interface ChangelogEntry {
  version: string;
  date: string;
  /** `highlight`: shown in bold and bright (e.g. an announcement). Older versions ignore it. */
  items: { de: string; en: string; highlight?: boolean }[];
}

/** In the browser, `?update` in the URL fakes an update for testing. */
const mockUpdate: UpdateHandle = {
  version: "1.3.0",
  install: async (onProgress) => {
    for (let i = 1; i <= 20; i++) {
      await new Promise((r) => setTimeout(r, 120));
      onProgress(i / 20);
    }
  },
};

export const updater = {
  current: async (): Promise<string> => {
    // Browser: newest bundled version; `?version=1.1.0` fakes an older one (changelog test).
    if (!isNative) return new URLSearchParams(location.search).get("version") ?? bundledChangelog[0].version;
    const { getVersion } = await import("@tauri-apps/api/app");
    return getVersion();
  },
  /** Fetches the signed latest.json from the newest GitHub release. null = up to date. */
  check: async (): Promise<UpdateHandle | null> => {
    if (!isNative) return new URLSearchParams(location.search).has("update") ? mockUpdate : null;
    const { check } = await import("@tauri-apps/plugin-updater");
    const found = await check();
    if (!found) return null;
    return {
      version: found.version,
      install: async (onProgress) => {
        let total = 0;
        let done = 0;
        await found.downloadAndInstall((e) => {
          if (e.event === "Started") total = e.data.contentLength ?? 0;
          else if (e.event === "Progress" && total) onProgress(Math.min(1, (done += e.data.chunkLength) / total));
        });
        // Windows quits the app itself while installing; otherwise restart here.
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      },
    };
  },
};

/**
 * Changelog of a newer version, before installing it: the same `src/changelog.json`
 * from that release's tag (anonymous, like the update check). null = not reachable.
 */
export async function fetchChangelog(version: string): Promise<ChangelogEntry[] | null> {
  if (!isNative) {
    const mock = { de: "Beispiel: Neuerung aus der kommenden Version", en: "Example: something new in the upcoming version" };
    return [{ version, date: new Date().toISOString().slice(0, 10), items: [mock, mock] }, ...bundledChangelog];
  }
  try {
    const r = await fetch(`https://raw.githubusercontent.com/Linux5Real/L4-Windows-NotchBar/v${version}/src/changelog.json`, {
      signal: AbortSignal.timeout(8000),
    });
    return r.ok ? ((await r.json()) as ChangelogEntry[]) : null;
  } catch {
    return null;
  }
}

// ---------- Autostart ----------

export const autostart = {
  get: (): Promise<boolean> => (isNative ? invoke<boolean>("autostart_get") : Promise.resolve(true)),
  set: (enabled: boolean): Promise<void> => (isNative ? invoke("autostart_set", { enabled }) : Promise.resolve()),
};

// ---------- Display ----------

export interface MonitorInfo {
  name: string;
  primary: boolean;
  width: number;
  height: number;
}

export const display = {
  monitors: (): Promise<MonitorInfo[]> =>
    isNative
      ? invoke<MonitorInfo[]>("display_monitors")
      : Promise.resolve([
          { name: "\\.\DISPLAY1", primary: true, width: 2560, height: 1440 },
          { name: "\\.\DISPLAY2", primary: false, width: 1920, height: 1080 },
        ]),
  apply: (config: { hideFullscreen: boolean; monitor: string | null; offset: number; gaming: boolean }) => {
    if (isNative) void invoke("display_apply", { config });
  },
  /** true while an app covers the notch's monitor in fullscreen. */
  onFullscreen: (handler: (on: boolean) => void): (() => void) => {
    if (!isNative) return () => {};
    const off = listen<boolean>("notch://fullscreen", (e) => handler(e.payload));
    return () => void off.then((f) => f());
  },
};

// ---------- Gaming mode ----------

/** FPS of the foreground process (ETW). error: no-admin | failed. */
/** One-time unlock so FPS work without running as admin (one UAC prompt). */
export function unlockFps(): Promise<"ok" | "relogin" | "cancelled" | "failed"> {
  if (isNative) return invoke("fps_unlock");
  return new Promise((r) => setTimeout(() => r("relogin"), 600));
}

export function fetchFps(): Promise<{ fps: number | null; error: string | null }> {
  if (isNative) return invoke("gaming_fps");
  return Promise.resolve({ fps: 138 + Math.round((Math.random() - 0.5) * 14), error: null });
}

// ---------- Privacy dots ----------

export interface PrivacyState {
  mic: boolean;
  camera: boolean;
  screen: boolean;
}

/** Toggled from the dev panel in the browser. */
export const mockPrivacy: PrivacyState = { mic: false, camera: false, screen: false };

export function fetchPrivacy(): Promise<PrivacyState> {
  return isNative ? invoke<PrivacyState>("privacy_state") : Promise.resolve({ ...mockPrivacy });
}

// ---------- Overview: volume + Windows focus ----------

export interface VolumeState {
  /** 0..1 */
  level: number;
  muted: boolean;
}

export interface FocusState {
  active: boolean;
  /** "focus" = focus session (Windows 11), "dnd" = only Do Not Disturb */
  kind: "focus" | "dnd";
}

const mockVolume: VolumeState = { level: 0.42, muted: false };
const mockFocus: FocusState = { active: false, kind: "focus" };

/** One program in the volume mixer (all its audio sessions together). */
export interface AppVolume {
  /** Lowercase exe name, e.g. "spotify.exe". */
  id: string;
  name: string;
  /** PNG data URL of the program icon. */
  icon: string | null;
  /** 0..1 */
  level: number;
  muted: boolean;
  /** Source of what is playing right now. */
  media: boolean;
}

/** App icons for the browser mock (simple marks, only for design work and stills). */
const svgIcon = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`)}`;

const mockIcons = {
  spotify: svgIcon(
    `<circle cx="16" cy="16" r="15" fill="#1ed760"/><g fill="none" stroke="#000" stroke-linecap="round"><path d="M8.5 12.2c5-1.5 10.6-1.1 15 1.2" stroke-width="2.4"/><path d="M9.4 16.6c4.2-1.2 8.8-.8 12.5 1.1" stroke-width="2"/><path d="M10.2 20.6c3.4-.9 6.9-.6 9.8.9" stroke-width="1.7"/></g>`,
  ),
  chrome: svgIcon(
    `<circle cx="16" cy="16" r="15" fill="#db4437"/><path d="M16 16 3.3 23.5A15 15 0 0 0 16 31z" fill="#0f9d58"/><path d="M16 16 16 31A15 15 0 0 0 28.7 8.5z" fill="#f4b400"/><path d="M16 16 3.3 23.5A15 15 0 0 1 3.3 8.5z" fill="#0f9d58"/><circle cx="16" cy="16" r="6.6" fill="#fff"/><circle cx="16" cy="16" r="5.2" fill="#4285f4"/>`,
  ),
  steam: svgIcon(
    `<circle cx="16" cy="16" r="15" fill="#1b2838"/><circle cx="20" cy="12.5" r="4.6" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="20" cy="12.5" r="2" fill="#fff"/><circle cx="11.5" cy="20.5" r="3.2" fill="#fff"/><path d="M11.5 20.5 20 12.5" stroke="#fff" stroke-width="2"/>`,
  ),
};

/** Exported for the dev panel ("Quelle wechseln"). */
export const mockApps: AppVolume[] = [
  { id: "spotify.exe", name: "Spotify", icon: mockIcons.spotify, level: 0.72, muted: false, media: true },
  { id: "chrome.exe", name: "Google Chrome", icon: mockIcons.chrome, level: 1, muted: false, media: false },
  { id: "steam.exe", name: "Steam", icon: mockIcons.steam, level: 0.3, muted: true, media: false },
];

/** Volume per app, like the Windows volume mixer (src-tauri/src/mixer.rs). */
export const mixer = {
  list: (): Promise<AppVolume[]> => (isNative ? invoke<AppVolume[]>("mixer_list") : Promise.resolve(mockApps.map((a) => ({ ...a })))),
  set: (id: string, patch: { level?: number; muted?: boolean }): Promise<void> => {
    if (isNative) return invoke("mixer_set", { id, ...patch });
    const app = mockApps.find((a) => a.id === id);
    if (app) Object.assign(app, patch, patch.level !== undefined && patch.level > 0 && patch.muted === undefined ? { muted: false } : {});
    return Promise.resolve();
  },
};

export const systemControls = {
  volume: (): Promise<VolumeState> => (isNative ? invoke<VolumeState>("volume_get") : Promise.resolve({ ...mockVolume })),
  setVolume: (patch: { level?: number; muted?: boolean }): Promise<VolumeState> => {
    if (isNative) return invoke<VolumeState>("volume_set", patch);
    Object.assign(mockVolume, patch, patch.level !== undefined && patch.level > 0 && patch.muted === undefined ? { muted: false } : {});
    return Promise.resolve({ ...mockVolume });
  },
  focus: (): Promise<FocusState> => (isNative ? invoke<FocusState>("focus_get") : Promise.resolve({ ...mockFocus })),
  setFocus: (active: boolean): Promise<FocusState> => {
    if (isNative) return invoke<FocusState>("focus_set", { active });
    mockFocus.active = active;
    return Promise.resolve({ ...mockFocus });
  },
};
