/*
 * Living world-building diorama scenes for the Vibe panel.
 * Handcrafted natural palettes, layered parallax, subtle cursor interaction, 60fps Canvas 2D.
 */

export type SceneId = "city" | "valley" | "train" | "trench" | "torii" | "jungle";

export const SCENES: { id: SceneId; label: string }[] = [
  { id: "city", label: "City Lights" },
  { id: "valley", label: "Golden Valley" },
  { id: "train", label: "Night Train" },
  { id: "trench", label: "Deep Trench" },
  { id: "torii", label: "Crimson Torii" },
  { id: "jungle", label: "Misty Jungle" },
];

export interface PointerState {
  x: number;
  y: number;
  active: boolean;
}

export interface SceneRenderer {
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, pointer: PointerState): void;
}

function makeRng(seedStart: number) {
  let seed = seedStart >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// ---------- 1. City Lights at Night ----------

function createCity(): SceneRenderer {
  const rand = makeRng(42);

  interface Building {
    x: number;
    w: number;
    h: number;
    layer: number;
    windows: { rx: number; ry: number; phase: number; warm: boolean; lit: boolean }[];
  }

  const buildings: Building[] = [];
  for (let layer = 0; layer < 2; layer++) {
    let x = -0.04;
    while (x < 1.06) {
      const bw = (layer === 0 ? 0.045 : 0.055) + rand() * 0.055;
      const bh = (layer === 0 ? 0.28 : 0.16) + rand() * (layer === 0 ? 0.44 : 0.34);
      const cols = Math.max(2, Math.floor(bw * 90));
      const rows = Math.max(3, Math.floor(bh * 24));
      const windows: Building["windows"] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rand() < (layer === 0 ? 0.34 : 0.46)) {
            windows.push({
              rx: (c + 0.5) / cols,
              ry: (r + 0.5) / rows,
              phase: rand() * Math.PI * 2,
              warm: rand() < 0.72,
              lit: rand() < 0.85,
            });
          }
        }
      }
      buildings.push({ x, w: bw, h: bh, layer, windows });
      x += bw * (0.78 + rand() * 0.28);
    }
  }

  const stars = Array.from({ length: 36 }, () => ({
    x: rand(),
    y: rand() * 0.48,
    phase: rand() * Math.PI * 2,
    r: 0.6 + rand() * 0.9,
  }));

  const cars = Array.from({ length: 18 }, (_, i) => ({
    x: rand(),
    speed: (i % 2 === 0 ? 1 : -1) * (0.045 + rand() * 0.06),
    yOff: i % 2 === 0 ? 0.84 : 0.89,
    red: i % 2 !== 0,
  }));

  return {
    draw(ctx, w, h, t, pointer) {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#05060c");
      sky.addColorStop(0.68, "#0c1020");
      sky.addColorStop(1, "#07080f");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      const parallax = pointer.active ? (pointer.x / w - 0.5) * 14 : 0;

      for (const s of stars) {
        const tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 1.4 + s.phase));
        ctx.fillStyle = `rgba(220,232,255,${tw * 0.6})`;
        ctx.beginPath();
        ctx.arc(s.x * w - parallax * 0.2, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      const horizon = h * 0.82;
      const glow = ctx.createLinearGradient(0, horizon - 55, 0, horizon + 10);
      glow.addColorStop(0, "rgba(110,130,210,0)");
      glow.addColorStop(1, "rgba(110,130,210,0.16)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, horizon - 55, w, 65);

      for (let layer = 0; layer < 2; layer++) {
        const shift = parallax * (layer === 0 ? 0.35 : 0.8);
        for (const b of buildings) {
          if (b.layer !== layer) continue;
          const bx = b.x * w - shift;
          const bw = b.w * w;
          const bh = b.h * horizon;
          const by = horizon - bh;

          ctx.fillStyle = layer === 0 ? "#0d101b" : "#07080e";
          ctx.fillRect(bx, by, bw, bh);

          for (const win of b.windows) {
            const pulse = 0.5 + 0.5 * Math.sin(t * 0.65 + win.phase);
            if (!win.lit && pulse < 0.75) continue;
            const wx = bx + 3 + win.rx * Math.max(2, bw - 6);
            const wy = by + 4 + win.ry * Math.max(4, bh - 8);
            const alpha = (layer === 0 ? 0.38 : 0.76) * (0.65 + pulse * 0.35);
            ctx.fillStyle = win.warm
              ? `rgba(255, 214, 145, ${alpha})`
              : `rgba(185, 220, 255, ${alpha * 0.9})`;
            ctx.fillRect(wx, wy, layer === 0 ? 1.8 : 2.3, layer === 0 ? 2.4 : 3.1);
          }
        }
      }

      ctx.fillStyle = "#05060b";
      ctx.fillRect(0, horizon, w, h - horizon);

      for (const car of cars) {
        car.x = (car.x + car.speed * 0.016 + 1) % 1;
        const cx = car.x * w;
        const cy = car.yOff * h;
        const col = car.red ? "255,92,92" : "255,234,188";
        const grad = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, 7);
        grad.addColorStop(0, `rgba(${col},0.95)`);
        grad.addColorStop(0.4, `rgba(${col},0.35)`);
        grad.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}

// ---------- 2. Golden Hour Valley (Firewatch Sunset) ----------

function createValley(): SceneRenderer {
  const rand = makeRng(108);
  const birds = Array.from({ length: 7 }, (_, i) => ({
    x: rand(),
    y: 0.22 + rand() * 0.26,
    speed: 0.014 + rand() * 0.012,
    flap: rand() * Math.PI * 2,
    size: 3 + (i % 3) * 1.1,
  }));

  const ridge = (ctx: CanvasRenderingContext2D, w: number, h: number, baseY: number, amp: number, freq: number, phase: number, shift: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-10, h + 10);
    for (let x = -10; x <= w + 10; x += 8) {
      const nx = (x + shift) / w;
      const y =
        baseY -
        Math.sin(nx * freq + phase) * amp -
        Math.cos(nx * freq * 2.1 - phase * 0.7) * (amp * 0.42) -
        Math.sin(nx * freq * 4.7 + phase) * (amp * 0.14);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w + 10, h + 10);
    ctx.closePath();
    ctx.fill();
  };

  return {
    draw(ctx, w, h, t, pointer) {
      const px = pointer.active ? (pointer.x / w - 0.5) * 18 : 0;

      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#2d1b4e");
      sky.addColorStop(0.32, "#8f3963");
      sky.addColorStop(0.62, "#e87a5d");
      sky.addColorStop(0.88, "#ffd18a");
      sky.addColorStop(1, "#ffe6b3");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      const sunX = w * 0.64 - px * 0.15;
      const sunY = h * 0.44 + Math.sin(t * 0.3) * 2;
      const halo = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 95);
      halo.addColorStop(0, "rgba(255,248,220,0.95)");
      halo.addColorStop(0.28, "rgba(255,214,140,0.45)");
      halo.addColorStop(1, "rgba(255,150,90,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 95, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fff5d6";
      ctx.beginPath();
      ctx.arc(sunX, sunY, 17, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 224, 190, 0.22)";
      for (let i = 0; i < 4; i++) {
        const cx = ((i * 0.3 + t * (0.008 + i * 0.002)) % 1.3 - 0.15) * w;
        const cy = h * (0.16 + i * 0.065);
        ctx.beginPath();
        ctx.ellipse(cx, cy, 48 + i * 10, 6 + (i % 2) * 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ridge(ctx, w, h, h * 0.63, 24, 4.2, 0.8, px * 0.2, "#c85d5c");
      ridge(ctx, w, h, h * 0.72, 22, 5.1, 2.3, px * 0.45, "#87334f");
      ridge(ctx, w, h, h * 0.82, 18, 6.2, 4.1, px * 0.75, "#4c1d3d");
      ridge(ctx, w, h, h * 0.91, 13, 7.5, 1.4, px * 1.1, "#220f24");

      ctx.strokeStyle = "rgba(45, 18, 36, 0.75)";
      ctx.lineWidth = 1.25;
      ctx.lineCap = "round";
      for (const b of birds) {
        b.x = (b.x + b.speed * 0.016) % 1.15;
        const bx = (b.x - 0.07) * w;
        const by = b.y * h + Math.sin(t * 2 + b.flap) * 3;
        const wing = Math.sin(t * 6.5 + b.flap) * b.size * 0.55;
        ctx.beginPath();
        ctx.moveTo(bx - b.size, by + wing);
        ctx.quadraticCurveTo(bx - b.size * 0.4, by - b.size * 0.35, bx, by);
        ctx.quadraticCurveTo(bx + b.size * 0.4, by - b.size * 0.35, bx + b.size, by + wing);
        ctx.stroke();
      }
    },
  };
}

// ---------- 3. Crimson Torii & Autumn Maples ----------

function createTorii(): SceneRenderer {
  const rand = makeRng(777);

  const leaves = Array.from({ length: 34 }, () => ({
    x: rand(),
    y: rand(),
    vx: 0.016 + rand() * 0.022,
    vy: 0.014 + rand() * 0.018,
    size: 3 + rand() * 3.2,
    rot: rand() * Math.PI * 2,
    spin: (rand() - 0.5) * 2.2,
    sway: rand() * Math.PI * 2,
    color: rand() < 0.45 ? "#ff4d4d" : rand() < 0.8 ? "#e02438" : "#ff7b54",
  }));

  const drawRidge = (ctx: CanvasRenderingContext2D, w: number, h: number, baseY: number, amp: number, shift: number, color: string, seed: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-10, h + 10);
    for (let x = -10; x <= w + 10; x += 8) {
      const nx = (x + shift) / w;
      const y = baseY - Math.sin(nx * 4.8 + seed) * amp - Math.cos(nx * 10.2 - seed) * (amp * 0.35);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w + 10, h + 10);
    ctx.closePath();
    ctx.fill();
  };

  return {
    draw(ctx, w, h, t, pointer) {
      const px = pointer.active ? (pointer.x / w - 0.5) * 16 : 0;

      // Deep burgundy to glowing scarlet twilight sky
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#19050b");
      sky.addColorStop(0.35, "#590d1e");
      sky.addColorStop(0.7, "#a61c2d");
      sky.addColorStop(0.95, "#e04638");
      sky.addColorStop(1, "#f26b4e");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Large glowing crimson-vermilion sun sitting low behind the gate
      const sunX = w * 0.54 - px * 0.18;
      const sunY = h * 0.5 + Math.sin(t * 0.3) * 1.5;
      const halo = ctx.createRadialGradient(sunX, sunY, 14, sunX, sunY, 105);
      halo.addColorStop(0, "rgba(255, 190, 150, 0.92)");
      halo.addColorStop(0.32, "rgba(255, 92, 72, 0.45)");
      halo.addColorStop(1, "rgba(180, 20, 40, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 105, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffcab0";
      ctx.beginPath();
      ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
      ctx.fill();

      // Wispy dark crimson dusk clouds
      ctx.fillStyle = "rgba(42, 6, 16, 0.32)";
      for (let i = 0; i < 3; i++) {
        const cx = ((i * 0.36 + t * (0.006 + i * 0.002)) % 1.35 - 0.17) * w;
        const cy = h * (0.2 + i * 0.09);
        ctx.beginPath();
        ctx.ellipse(cx, cy, 56 + i * 14, 5 + i * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Layered distant cedar hills
      drawRidge(ctx, w, h, h * 0.72, 18, px * 0.25, "#420916", 1.2);
      drawRidge(ctx, w, h, h * 0.82, 13, px * 0.5, "#26050e", 3.1);

      // Calm reflective shrine lake along bottom
      const waterY = h * 0.82;
      const water = ctx.createLinearGradient(0, waterY, 0, h);
      water.addColorStop(0, "#3b0a16");
      water.addColorStop(1, "#140308");
      ctx.fillStyle = water;
      ctx.fillRect(0, waterY, w, h - waterY);

      // Sun shimmer on the water
      for (let i = 0; i < 6; i++) {
        const ry = waterY + 5 + i * 5.5;
        const rw = 36 - i * 3 + Math.sin(t * 2.2 + i) * 5;
        ctx.fillStyle = `rgba(255, 145, 115, ${0.32 - i * 0.04})`;
        ctx.fillRect(sunX - rw / 2, ry, rw, 1.6);
      }

      // Crisp minimalist Torii gate silhouette in midground
      const gx = w * 0.54 - px * 0.7;
      const baseY = waterY + 6;
      const gateH = 66;
      const pillarSpan = 34;

      ctx.fillStyle = "#160308";
      ctx.fillRect(gx - pillarSpan / 2 - 2.5, baseY - gateH + 8, 5, gateH - 8);
      ctx.fillRect(gx + pillarSpan / 2 - 2.5, baseY - gateH + 8, 5, gateH - 8);
      ctx.fillRect(gx - pillarSpan * 0.72, baseY - gateH + 19, pillarSpan * 1.44, 4);
      ctx.fillRect(gx - 2, baseY - gateH + 7, 4, 13);
      ctx.beginPath();
      ctx.moveTo(gx - pillarSpan * 0.98, baseY - gateH + 2);
      ctx.quadraticCurveTo(gx, baseY - gateH + 10, gx + pillarSpan * 0.98, baseY - gateH + 2);
      ctx.lineTo(gx + pillarSpan * 0.9, baseY - gateH + 10);
      ctx.quadraticCurveTo(gx, baseY - gateH + 15, gx - pillarSpan * 0.9, baseY - gateH + 10);
      ctx.closePath();
      ctx.fill();

      // Subtle pillar reflections in the shrine water
      ctx.fillStyle = "rgba(18, 3, 8, 0.45)";
      ctx.fillRect(gx - pillarSpan / 2 - 2, baseY, 4, h - baseY);
      ctx.fillRect(gx + pillarSpan / 2 - 2, baseY, 4, h - baseY);

      // Foreground maple branch silhouettes framing bottom corners
      ctx.fillStyle = "#120206";
      ctx.beginPath();
      ctx.arc(w * 0.04 - px * 0.9, h * 0.96, 48, 0, Math.PI * 2);
      ctx.arc(w * 0.94 - px * 0.9, h * 0.98, 56, 0, Math.PI * 2);
      ctx.fill();

      // Drifting crimson maple leaves (momiji)
      for (const l of leaves) {
        let vx = l.vx;
        let vy = l.vy;
        if (pointer.active) {
          const dx = l.x * w - pointer.x;
          const dy = l.y * h - pointer.y;
          const d = Math.hypot(dx, dy) + 1;
          if (d < 85) {
            vx += (dx / d) * 0.055 * (1 - d / 85);
            vy += (dy / d) * 0.055 * (1 - d / 85);
          }
        }
        l.x = (l.x + vx * 0.016 + 1.1) % 1.1;
        l.y = (l.y + vy * 0.016 + Math.sin(t * 1.9 + l.sway) * 0.0007 + 1.1) % 1.1;
        l.rot += l.spin * 0.016;

        ctx.save();
        ctx.translate((l.x - 0.05) * w, (l.y - 0.05) * h);
        ctx.rotate(l.rot);
        ctx.fillStyle = l.color;
        const s = l.size;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.35, -s * 0.25);
        ctx.lineTo(s * 0.95, -s * 0.2);
        ctx.lineTo(s * 0.4, s * 0.25);
        ctx.lineTo(0, s * 0.75);
        ctx.lineTo(-s * 0.4, s * 0.25);
        ctx.lineTo(-s * 0.95, -s * 0.2);
        ctx.lineTo(-s * 0.35, -s * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    },
  };
}

// ---------- 4. Night Train Window (Sleeper Express) ----------

function createTrain(): SceneRenderer {
  const rand = makeRng(612);

  const stars = Array.from({ length: 42 }, () => ({
    x: rand(),
    y: rand() * 0.48,
    r: 0.6 + rand() * 0.95,
    phase: rand() * Math.PI * 2,
  }));

  const villages = Array.from({ length: 16 }, () => ({
    x: rand(),
    y: 0.62 + rand() * 0.14,
    w: 2 + rand() * 2.5,
    phase: rand() * Math.PI * 2,
  }));

  return {
    draw(ctx, w, h, t, pointer) {
      const py = pointer.active ? (pointer.y / h - 0.5) * 6 : 0;

      // Deep indigo midnight sky
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#070b18");
      sky.addColorStop(0.58, "#131c36");
      sky.addColorStop(0.84, "#1b2848");
      sky.addColorStop(1, "#090e1c");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Stars
      for (const s of stars) {
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.2 + s.phase));
        ctx.fillStyle = `rgba(225,236,255,${tw * 0.7})`;
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h - py * 0.2, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Pale moon + soft halo
      const moonX = w * 0.78;
      const moonY = h * 0.24 - py * 0.3;
      const halo = ctx.createRadialGradient(moonX, moonY, 6, moonX, moonY, 54);
      halo.addColorStop(0, "rgba(235, 245, 255, 0.85)");
      halo.addColorStop(0.35, "rgba(180, 210, 255, 0.22)");
      halo.addColorStop(1, "rgba(140, 180, 255, 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 54, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#eef5ff";
      ctx.beginPath();
      ctx.arc(moonX, moonY, 11, 0, Math.PI * 2);
      ctx.fill();

      // Distant scrolling rolling hills
      const drawHill = (baseY: number, amp: number, speed: number, color: string, seed: number) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) {
          const nx = x / w + t * speed;
          const y = baseY - Math.sin(nx * 5.2 + seed) * amp - Math.cos(nx * 11.4 - seed) * (amp * 0.4);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
      };

      drawHill(h * 0.68, 16, 0.014, "#0f172b", 1.1);
      drawHill(h * 0.77, 13, 0.034, "#0a101e", 3.4);

      // Tiny warm village lights gliding by on the midground hills
      for (const v of villages) {
        const vx = ((v.x - t * 0.034) % 1 + 1) % 1;
        const glow = 0.6 + 0.4 * Math.sin(t * 2 + v.phase);
        ctx.fillStyle = `rgba(255, 206, 128, ${0.8 * glow})`;
        ctx.fillRect(vx * w, v.y * h, v.w, v.w * 0.9);
      }

      // Moonlit lake reflection strip along the lower edge
      const lakeY = h * 0.83;
      const lake = ctx.createLinearGradient(0, lakeY, 0, h);
      lake.addColorStop(0, "#0b1428");
      lake.addColorStop(1, "#060a14");
      ctx.fillStyle = lake;
      ctx.fillRect(0, lakeY, w, h - lakeY);

      for (let i = 0; i < 9; i++) {
        const ry = lakeY + 4 + i * 4;
        const rw = 26 - i * 1.8 + Math.sin(t * 2 + i) * 5;
        ctx.fillStyle = `rgba(215, 232, 255, ${0.26 - i * 0.022})`;
        ctx.fillRect(moonX - rw / 2, ry, rw, 1.4);
      }

      // Calm foreground utility poles & sagging catenary power lines
      const spacing = 190;
      const offset = (t * 85) % spacing;
      const poles: number[] = [];
      for (let x = -offset; x < w + spacing; x += spacing) {
        poles.push(x);
      }

      // Two sagging power cables between poles
      ctx.strokeStyle = "rgba(8, 10, 18, 0.82)";
      ctx.lineWidth = 1.2;
      for (const wireY of [h * 0.31, h * 0.39]) {
        ctx.beginPath();
        for (let i = 0; i < poles.length - 1; i++) {
          const x0 = poles[i];
          const x1 = poles[i + 1];
          const midX = (x0 + x1) * 0.5;
          ctx.moveTo(x0, wireY);
          ctx.quadraticCurveTo(midX, wireY + 26, x1, wireY);
        }
        ctx.stroke();
      }

      // Silhouetted poles rushing past
      ctx.fillStyle = "#05070e";
      for (const x of poles) {
        ctx.fillRect(x - 2.5, h * 0.24, 5, h * 0.76);
        ctx.fillRect(x - 13, h * 0.3, 26, 3);
        ctx.fillRect(x - 10, h * 0.38, 20, 2.5);
      }

      // Subtle warm interior train-window glass reflection
      const sheen = ctx.createLinearGradient(0, 0, w * 0.45, h * 0.5);
      sheen.addColorStop(0, "rgba(255, 210, 160, 0.06)");
      sheen.addColorStop(1, "rgba(255, 210, 160, 0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, w, h);
    },
  };
}

// ---------- 5. Misty Jungle Canopy (Sunlit Rainforest) ----------

function createJungle(): SceneRenderer {
  const rand = makeRng(818);

  const motes = Array.from({ length: 44 }, () => ({
    x: rand(),
    y: rand(),
    r: 0.7 + rand() * 1.4,
    vx: 0.004 + rand() * 0.008,
    vy: -0.004 + rand() * 0.01,
    phase: rand() * Math.PI * 2,
  }));

  const butterflies = Array.from({ length: 3 }, (_, i) => ({
    x: 0.15 + i * 0.3,
    y: 0.42 + (i % 2) * 0.16,
    speed: (i % 2 === 0 ? 1 : -1) * (0.02 + rand() * 0.015),
    phase: rand() * Math.PI * 2,
    size: 4 + (i % 2) * 1.2,
  }));

  const vines = [
    { x: 0.12, len: 0.52, sway: 0.4 },
    { x: 0.24, len: 0.36, sway: 1.8 },
    { x: 0.78, len: 0.48, sway: 2.9 },
    { x: 0.89, len: 0.62, sway: 4.1 },
  ];

  const drawCanopyRidge = (ctx: CanvasRenderingContext2D, w: number, h: number, baseY: number, amp: number, shift: number, color: string, seed: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-10, h + 10);
    for (let x = -10; x <= w + 10; x += 10) {
      const nx = (x + shift) / w;
      // Billowing treetop silhouette
      const y = baseY - Math.abs(Math.sin(nx * 14 + seed)) * amp - Math.sin(nx * 5 - seed) * (amp * 0.5);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w + 10, h + 10);
    ctx.closePath();
    ctx.fill();
  };

  return {
    draw(ctx, w, h, t, pointer) {
      const px = pointer.active ? (pointer.x / w - 0.5) * 16 : 0;

      // Sunlit misty rainforest atmosphere
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#10382e");
      bg.addColorStop(0.42, "#1f5c4a");
      bg.addColorStop(0.78, "#2c7359");
      bg.addColorStop(1, "#0b241d");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Distant misty canopy layer
      drawCanopyRidge(ctx, w, h, h * 0.58, 16, px * 0.2, "#17483a", 0.7);

      // Drifting low mist band
      const mist1 = ctx.createLinearGradient(0, h * 0.38, 0, h * 0.78);
      mist1.addColorStop(0, "rgba(195, 240, 215, 0)");
      mist1.addColorStop(0.5, "rgba(195, 240, 215, 0.16)");
      mist1.addColorStop(1, "rgba(195, 240, 215, 0)");
      ctx.fillStyle = mist1;
      ctx.fillRect(0, h * 0.38, w, h * 0.4);

      // Warm golden sunbeams slicing diagonally through the canopy
      for (let i = 0; i < 4; i++) {
        const rx = w * (0.22 + i * 0.2) + Math.sin(t * 0.35 + i) * 10 - px * 0.25;
        const grad = ctx.createLinearGradient(rx, 0, rx + 70, h);
        grad.addColorStop(0, "rgba(255, 242, 185, 0.2)");
        grad.addColorStop(0.7, "rgba(220, 245, 195, 0.08)");
        grad.addColorStop(1, "rgba(220, 245, 195, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(rx - 18, 0);
        ctx.lineTo(rx + 18, 0);
        ctx.lineTo(rx + 96, h);
        ctx.lineTo(rx + 42, h);
        ctx.closePath();
        ctx.fill();
      }

      // Midground jungle layer
      drawCanopyRidge(ctx, w, h, h * 0.75, 18, px * 0.5, "#0f3328", 2.4);

      // Floating sunlit pollen / dust motes
      for (const m of motes) {
        m.x = (m.x + m.vx * 0.016 + 1) % 1;
        m.y = (m.y + m.vy * 0.016 + 1) % 1;
        const glow = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.8 + m.phase));
        ctx.fillStyle = `rgba(255, 244, 185, ${0.55 * glow})`;
        ctx.beginPath();
        ctx.arc(m.x * w, m.y * h, m.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Electric-blue morpho butterflies fluttering lazily
      for (const b of butterflies) {
        b.x = (b.x + b.speed * 0.016 + 1.15) % 1.15;
        const bx = (b.x - 0.07) * w;
        const by = b.y * h + Math.sin(t * 2.4 + b.phase) * 12;
        const flap = Math.abs(Math.sin(t * 9 + b.phase));
        const s = b.size;
        ctx.fillStyle = "rgba(72, 196, 255, 0.92)";
        ctx.beginPath();
        ctx.ellipse(bx - s * 0.45 * flap, by - 1, s * 0.75 * flap + 0.8, s * 0.55, -0.3, 0, Math.PI * 2);
        ctx.ellipse(bx + s * 0.45 * flap, by - 1, s * 0.75 * flap + 0.8, s * 0.55, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Gently swaying hanging vines from top canopy
      ctx.strokeStyle = "#081c16";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      for (const v of vines) {
        const vx = v.x * w - px * 0.85;
        const sway = Math.sin(t * 1.1 + v.sway) * 9;
        const vy = v.len * h;
        ctx.beginPath();
        ctx.moveTo(vx, -2);
        ctx.quadraticCurveTo(vx + sway * 0.5, vy * 0.55, vx + sway, vy);
        ctx.stroke();

        // Tiny leaves along each vine
        ctx.fillStyle = "#0b261e";
        for (let k = 1; k <= 4; k++) {
          const f = k / 4.5;
          const lx = vx + sway * f * f;
          const ly = vy * f;
          ctx.beginPath();
          ctx.ellipse(lx + (k % 2 === 0 ? 4 : -4), ly, 4.5, 2.2, k % 2 === 0 ? 0.5 : -0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Dark foreground foliage framing bottom corners
      drawCanopyRidge(ctx, w, h, h * 0.91, 14, px * 1.0, "#061510", 4.1);
    },
  };
}

// ---------- 6. Deep Trench (Abyssal Deep Ocean) ----------

function createTrench(): SceneRenderer {
  const rand = makeRng(4040);

  const snow = Array.from({ length: 65 }, () => ({
    x: rand(),
    y: rand(),
    r: 0.5 + rand() * 1.3,
    vy: 0.01 + rand() * 0.02,
    drift: rand() * Math.PI * 2,
    bio: rand() < 0.22,
  }));

  return {
    draw(ctx, w, h, t, pointer) {
      const px = pointer.active ? (pointer.x / w - 0.5) * 14 : 0;

      // Abyssal deep-ocean gradient
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#030b1a");
      bg.addColorStop(0.5, "#020712");
      bg.addColorStop(1, "#010308");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Faint upper-abyss blue scatter
      const scatter = ctx.createRadialGradient(w * 0.5, -20, 10, w * 0.5, -20, w * 0.55);
      scatter.addColorStop(0, "rgba(24, 102, 168, 0.22)");
      scatter.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = scatter;
      ctx.fillRect(0, 0, w, h);

      // Gliding shadowy manta ray in the deep blue haze
      const mx = ((t * 0.032 + 0.35) % 1.35 - 0.17) * w;
      const my = h * 0.42 + Math.sin(t * 0.9) * 10;
      const wing = Math.sin(t * 2.3) * 9;
      ctx.save();
      ctx.translate(mx, my);
      ctx.fillStyle = "rgba(14, 48, 82, 0.72)";
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.quadraticCurveTo(6, -10, -8, -18 + wing);
      ctx.quadraticCurveTo(-4, -4, -14, 0);
      ctx.quadraticCurveTo(-4, 4, -8, 18 - wing);
      ctx.quadraticCurveTo(6, 10, 22, 0);
      ctx.closePath();
      ctx.fill();
      // Slender tail
      ctx.strokeStyle = "rgba(14, 48, 82, 0.65)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-13, 0);
      ctx.quadraticCurveTo(-28, Math.sin(t * 2.3) * 4, -42, Math.sin(t * 2.3 - 1) * 5);
      ctx.stroke();
      ctx.restore();

      // Drifting marine snow + sparse bioluminescent sparks
      for (const p of snow) {
        p.y = (p.y + p.vy * 0.016) % 1;
        const sx = p.x * w + Math.sin(t * 0.7 + p.drift) * 5;
        const sy = p.y * h;

        if (p.bio) {
          const pulse = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 2.1 + p.drift));
          ctx.fillStyle = `rgba(56, 232, 255, ${0.55 * pulse})`;
          ctx.beginPath();
          ctx.arc(sx, sy, p.r * 1.25, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = "rgba(175, 220, 248, 0.22)";
          ctx.beginPath();
          ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Jagged abyssal trench walls framing the bottom
      ctx.fillStyle = "#01040a";
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h * 0.58);
      ctx.lineTo(w * 0.14 - px * 0.5, h * 0.78);
      ctx.lineTo(w * 0.34 - px * 0.5, h * 0.92);
      ctx.lineTo(w * 0.64 - px * 0.5, h * 0.94);
      ctx.lineTo(w * 0.84 - px * 0.5, h * 0.76);
      ctx.lineTo(w, h * 0.55);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    },
  };
}

export function createScene(id: SceneId): SceneRenderer {
  switch (id) {
    case "city": return createCity();
    case "valley": return createValley();
    case "train": return createTrain();
    case "trench": return createTrench();
    case "torii": return createTorii();
    case "jungle": return createJungle();
  }
}
