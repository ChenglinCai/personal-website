"use client";

import { useEffect, useRef } from "react";

// A single full-screen <canvas> painting two layers each frame:
//   1. A slow-twinkling starfield over deep obsidian (subtle cursor parallax).
//   2. A plasma system modelled loosely on a magnetically-confined fusion
//      plasma: particles are born near the cursor with an orbital velocity,
//      a "magnetic" swirl rotates them, and a confinement spring keeps them
//      circling a core instead of dispersing. Color follows a temperature
//      gradient — white-hot core cooling out to the magenta-pink glow that
//      real hydrogen plasma emits.
// When the mouse is idle (or on touch / first load) an auto emitter drifts
// across the screen so the effect is always alive.

type Star = {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  twPhase: number;
  twSpeed: number;
  depth: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bx: number; // birth anchor — the core this particle is confined around
  by: number;
  life: number;
  maxLife: number;
  size: number;
};

export default function StarfieldPlasma() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let width = 0;
    let height = 0;
    let stars: Star[] = [];

    // Temperature ramp, hottest → coolest. A real fusion plasma has a
    // white-hot dense core fading through blue/violet to the magenta-pink
    // of glowing hydrogen at the cooler edge.
    const TEMP: [number, number, number][] = [
      [205, 35, 96], // near-white (hottest)
      [202, 75, 84], // blue-white
      [222, 88, 74], // blue
      [258, 92, 67], // indigo
      [292, 95, 64], // violet
      [315, 96, 61], // magenta
      [332, 90, 56], // pink-red (coolest)
    ];
    const makeSprite = (h: number, s: number, l: number) => {
      const size = 64;
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const g = c.getContext("2d")!;
      const grd = g.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2
      );
      grd.addColorStop(0, `hsla(${h}, ${s}%, ${l}%, 0.9)`);
      grd.addColorStop(0.35, `hsla(${h}, ${s}%, ${l}%, 0.32)`);
      grd.addColorStop(1, `hsla(${h}, ${s}%, ${Math.max(40, l - 10)}%, 0)`);
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
      return c;
    };
    const tempSprites = TEMP.map(([h, s, l]) => makeSprite(h, s, l));
    const spriteForTemp = (temp: number) => {
      const idx = Math.round((1 - temp) * (tempSprites.length - 1));
      return tempSprites[Math.max(0, Math.min(tempSprites.length - 1, idx))];
    };

    // Soft glowing star sprite: a hot near-white core fading to a faint blue
    // halo, so bright stars actually "shine" instead of reading as flat dots.
    const makeStarSprite = () => {
      const size = 32;
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const g = c.getContext("2d")!;
      const grd = g.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2
      );
      grd.addColorStop(0, "rgba(255, 255, 255, 1)");
      grd.addColorStop(0.18, "rgba(223, 231, 255, 0.85)");
      grd.addColorStop(0.5, "rgba(180, 200, 255, 0.28)");
      grd.addColorStop(1, "rgba(180, 200, 255, 0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
      return c;
    };
    const starSprite = makeStarSprite();

    const particles: Particle[] = [];
    const pointer = { x: -9999, y: -9999, lastMove: -9999 };

    const buildStars = () => {
      const count = Math.floor((width * height) / 9000); // fewer stars
      stars = [];
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() * 1.4 + 0.5,
          baseAlpha: Math.random() * 0.5 + 0.4, // brighter
          twPhase: Math.random() * Math.PI * 2,
          twSpeed: Math.random() * 1.6 + 0.6, // livelier twinkle
          depth: Math.random(),
        });
      }
    }

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildStars();
    }

    resize();

    // Reduced-motion: one static starfield, no animation.
    if (reduce) {
      const renderStatic = () => {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#06060c";
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "lighter";
        for (const st of stars) {
          const halo = st.size * 7;
          ctx.globalAlpha = st.baseAlpha * 0.7;
          ctx.drawImage(
            starSprite,
            st.x - halo / 2,
            st.y - halo / 2,
            halo,
            halo
          );
          ctx.globalAlpha = Math.min(1, st.baseAlpha * 1.3);
          ctx.fillStyle = "#f2f5ff";
          ctx.beginPath();
          ctx.arc(st.x, st.y, st.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      };
      renderStatic();
      const onResize = () => {
        resize();
        renderStatic();
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    let t = 0;
    let raf = 0;

    // Precomputed rotation for the "magnetic" swirl (rotate velocity vector).
    const SWIRL = 0.01;
    const swirlCos = Math.cos(SWIRL);
    const swirlSin = Math.sin(SWIRL);
    const CONFINE = 0.001; // spring strength pulling particles to their core

    const emitterPosition = () => {
      // Follow the cursor while it's moving; after ~10s of stillness, drift
      // on its own along a Lissajous curve.
      const active = t - pointer.lastMove < 600;
      if (active) return { x: pointer.x, y: pointer.y };
      const cx = width / 2;
      const cy = height / 2;
      return {
        x: cx + Math.cos(t * 0.012) * width * 0.28,
        y: cy + Math.sin(t * 0.017) * height * 0.26,
      };
    }

    const emit = () => {
      // Stay completely empty until the visitor moves the cursor at least once,
      // so the auto-drift never appears on first load — only after they move
      // and then go still. (lastMove starts at -9999 = "has never moved".)
      if (pointer.lastMove < 0) return;
      if (particles.length > 800) return;
      const { x, y } = emitterPosition();
      for (let i = 0; i < 10; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r0 = Math.random() * 6; // born close to the core
        const tan = Math.random() * 1.1 + 0.5; // tangential (orbital) speed
        const out = Math.random() * 0.3; // tiny outward drift
        particles.push({
          bx: x,
          by: y,
          x: x + Math.cos(ang) * r0,
          y: y + Math.sin(ang) * r0,
          vx: -Math.sin(ang) * tan + Math.cos(ang) * out,
          vy: Math.cos(ang) * tan + Math.sin(ang) * out,
          life: 0,
          maxLife: Math.random() * 70 + 50,
          size: Math.random() * 5 + 3, // small — many small blobs read smooth
        });
      }
    }

    const frame = () => {
      t += 1;

      // Translucent obsidian fill: deep background + gentle trail fade.
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(6, 6, 13, 0.26)";
      ctx.fillRect(0, 0, width, height);

      const px = pointer.x > -9999 ? pointer.x - width / 2 : 0;
      const py = pointer.y > -9999 ? pointer.y - height / 2 : 0;

      // Stars — glowing halo + bright core with a lively twinkle. Additive
      // blending lets the halos bloom so they genuinely shine.
      ctx.globalCompositeOperation = "lighter";
      for (const st of stars) {
        const tw = 0.45 + 0.55 * Math.sin(t * 0.035 * st.twSpeed + st.twPhase);
        const a = st.baseAlpha * tw;
        const sx = st.x - px * st.depth * 0.015;
        const sy = st.y - py * st.depth * 0.015;

        // Soft glowing halo.
        const halo = st.size * 7;
        ctx.globalAlpha = a * 0.7;
        ctx.drawImage(starSprite, sx - halo / 2, sy - halo / 2, halo, halo);

        // Crisp bright core.
        ctx.globalAlpha = Math.min(1, a * 1.3);
        ctx.fillStyle = "#f2f5ff";
        ctx.beginPath();
        ctx.arc(sx, sy, st.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      // Plasma — additive blending; overlaps build the white-hot core.
      emit();
      ctx.globalCompositeOperation = "lighter";
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += 1;
        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }

        // "Magnetic" swirl: rotate the velocity vector each frame.
        const vx2 = p.vx * swirlCos - p.vy * swirlSin;
        const vy2 = p.vx * swirlSin + p.vy * swirlCos;
        p.vx = vx2;
        p.vy = vy2;

        // Confinement: spring back toward the core it was born around.
        const dx = p.x - p.bx;
        const dy = p.y - p.by;
        p.vx -= dx * CONFINE;
        p.vy -= dy * CONFINE;

        // A little turbulence for organic filaments, then drag.
        p.vx += (Math.random() - 0.5) * 0.1;
        p.vy += (Math.random() - 0.5) * 0.1;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.x += p.vx;
        p.y += p.vy;

        // Temperature: hot when young and near the core, cooling outward.
        const prog = p.life / p.maxLife;
        const r = Math.hypot(dx, dy);
        const temp = (1 - prog) * (1 - Math.min(1, r / 130) * 0.55);

        ctx.globalAlpha = Math.sin(prog * Math.PI) * 0.55;
        const s = p.size * (0.5 + prog * 0.5);
        ctx.drawImage(spriteForTemp(temp), p.x - s / 2, p.y - s / 2, s, s);
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }

    const onMove = (e: MouseEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.lastMove = t;
    };
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length) {
        pointer.x = e.touches[0].clientX;
        pointer.y = e.touches[0].clientY;
        pointer.lastMove = t;
      }
    };
    const onResize = () => resize();

    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("resize", onResize);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
