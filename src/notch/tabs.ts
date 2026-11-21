import type { ComponentType } from "react";
import {
  ArrowsLeftRight,
  Camera,
  ClipboardText,
  CloudSun,
  Cpu,
  GearSix,
  SquaresFour,
  MusicNotesSimple,
  NotePencil,
  Sparkle,
  type Icon,
} from "@phosphor-icons/react";
import { OverviewView } from "../features/overview/OverviewView";
import { NowPlayingView } from "../features/now-playing/NowPlayingView";
import { NotesView } from "../features/notes/NotesView";
import { ClipboardView } from "../features/clipboard/ClipboardView";
import { SnapView } from "../features/snap/SnapView";
import { AskView } from "../features/ask/AskView";
import { ConvertView } from "../features/convert/ConvertView";
import { WeatherView } from "../features/weather/WeatherView";
import { SystemView } from "../features/system/SystemView";
import { SettingsView } from "../features/settings/SettingsView";

/**
 * Registry of all tools in the open notch. New tool = new entry here
 * + ID in `TOOL_IDS` (src/settings/store.ts). Visibility and order
 * are up to the user in the settings.
 *
 * `size` is the open notch size for this tool (incl. header and dock);
 * the shape morphs there on tab switch. Max. 740 × 540 (window size).
 * Tools can grow it at runtime: `requestSize` (src/notch/size.ts).
 */
export interface NotchTab {
  id: string;
  label: string;
  icon: Icon;
  size: { w: number; h: number };
  View: ComponentType;
}

export const tabs: NotchTab[] = [
  { id: "overview", label: "Übersicht", icon: SquaresFour, size: { w: 520, h: 252 }, View: OverviewView },
  { id: "media", label: "Wiedergabe", icon: MusicNotesSimple, size: { w: 520, h: 232 }, View: NowPlayingView },
  { id: "notes", label: "Notiz", icon: NotePencil, size: { w: 520, h: 260 }, View: NotesView },
  { id: "clipboard", label: "Zwischenablage", icon: ClipboardText, size: { w: 600, h: 236 }, View: ClipboardView },
  { id: "snap", label: "Snap", icon: Camera, size: { w: 580, h: 420 }, View: SnapView },
  { id: "ask", label: "Ask", icon: Sparkle, size: { w: 560, h: 440 }, View: AskView },
  { id: "convert", label: "Converter", icon: ArrowsLeftRight, size: { w: 520, h: 290 }, View: ConvertView },
  { id: "weather", label: "Wetter", icon: CloudSun, size: { w: 520, h: 250 }, View: WeatherView },
  { id: "system", label: "Hardware", icon: Cpu, size: { w: 600, h: 248 }, View: SystemView },
];

/** Settings: reached via the gear, not in the tool bar. */
export const settingsTab: NotchTab = { id: "settings", label: "Einstellungen", icon: GearSix, size: { w: 660, h: 460 }, View: SettingsView };

export function findTab(id: string): NotchTab | undefined {
  return id === settingsTab.id ? settingsTab : tabs.find((t) => t.id === id);
}
