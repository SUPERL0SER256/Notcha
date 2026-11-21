import { useEffect, useRef } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { createStore } from "../../lib/store";
import { HeaderActions, HeaderButton } from "../../notch/header";
import { createScene, SCENES, type PointerState, type SceneId } from "./scenes";
import { t } from "../../i18n";

const vibeScene = createStore<SceneId>("city", { persist: "vibe-scene" });

export function VibeView() {
  const saved = vibeScene.use();
  const scene: SceneId = SCENES.some((s) => s.id === saved) ? saved : "city";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<PointerState>({ x: 0, y: 0, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const renderer = createScene(scene);
    let w = 0;
    let h = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      renderer.draw(ctx, w, h, (now - start) / 1000, pointer.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [scene]);

  const currentIdx = SCENES.findIndex((s) => s.id === scene);
  const currentScene = SCENES[currentIdx] ?? SCENES[0];

  const stepScene = (delta: number) => {
    const next = SCENES[(currentIdx + delta + SCENES.length) % SCENES.length];
    vibeScene.set(next.id);
  };

  return (
    <div className="flex h-full flex-col px-4 pt-1 pb-2">
      <HeaderActions>
        <HeaderButton label={t("Vorherige Szene")} onClick={() => stepScene(-1)}>
          <CaretLeft size={13} weight="bold" />
        </HeaderButton>
        <span className="min-w-[96px] text-center text-caption font-medium text-label-2 select-none">
          {currentScene.label}
        </span>
        <HeaderButton label={t("Nächste Szene")} onClick={() => stepScene(1)}>
          <CaretRight size={13} weight="bold" />
        </HeaderButton>
      </HeaderActions>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[14px] border border-white/[0.06] bg-[#060608]">
        <canvas
          ref={canvasRef}
          className="block size-full"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            pointer.current.x = e.clientX - r.left;
            pointer.current.y = e.clientY - r.top;
            pointer.current.active = true;
          }}
          onPointerLeave={() => {
            pointer.current.active = false;
          }}
        />
      </div>
    </div>
  );
}
