import { AnimatePresence, motion } from "motion/react";
import { springs } from "../../design/motion";
import { t } from "../../i18n";
import { settings } from "../../settings/store";
import { privacy } from "./store";

/**
 * Dots like on iPhone, right of the camera: green = mic or camera in use,
 * red = screen is being recorded or streamed.
 */
export function PrivacyDots() {
  const enabled = settings.use().privacyDots;
  const p = privacy.use();

  const talk = p.mic || p.camera;
  const dots = enabled ? [p.screen && "red", talk && "green"].filter((d): d is string => !!d) : [];

  return (
    // A bit right of the imagined camera in the middle, clear both closed and open.
    <div className="pointer-events-none absolute top-0 left-1/2 ml-[24px] flex h-[30px] items-center gap-[5px]">
      <AnimatePresence>
        {dots.map((color) => (
          <motion.span
            key={color}
            className="privacy-dot size-[6px] rounded-full"
            title={color === "red" ? t("Bildschirm wird aufgenommen") : t("Mikrofon oder Kamera aktiv")}
            style={{ backgroundColor: `var(--color-${color})`, ["--dot" as string]: `var(--color-${color})` }}
            initial={{ opacity: 0, transform: "scale(0.9)" }}
            animate={{ opacity: 1, transform: "scale(1)" }}
            exit={{ opacity: 0, transform: "scale(0.9)" }}
            transition={springs.snappy}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
