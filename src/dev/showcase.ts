import { navigate } from "../notch/nav";
import { media } from "../platform/media";
import { settings, updateSettings } from "../settings/store";

/** Tools in the dock during the showcase, in this order. */
const SHOWCASE_TOOLS = ["overview", "media", "ask", "convert", "clipboard", "weather", "notes"];

/**
 * Browser only (`?showcase`): English UI and a curated dock.
 * `window.__showcase` lets a capture script control playback or navigation.
 */
export function startShowcase() {
  updateSettings((s) => ({
    openMode: "hover",
    hoverDelay: "normal",
    tools: [
      ...SHOWCASE_TOOLS.map((id) => ({ id, enabled: true })),
      ...s.tools.filter((x) => !SHOWCASE_TOOLS.includes(x.id)).map((x) => ({ id: x.id, enabled: false })),
    ],
    weather: { name: "Amsterdam", lat: 52.37, lon: 4.89, auto: false },
    ask: { provider: "gemini" },
  }));
  navigate("overview");

  Object.assign(window, {
    __showcase: {
      play: () => !media.get()?.isPlaying && media.toggle(),
      pause: () => media.get()?.isPlaying && media.toggle(),
      navigate,
      settings,
    },
  });
}
