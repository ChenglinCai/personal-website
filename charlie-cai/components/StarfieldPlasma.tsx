"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

// The view pane of a small shuttle: one full-screen <canvas> plus a DOM
// layer for the nameplate, the three section beacons, and the flight HUD.
//
// Physics kept honest (sub-light):
//   • Pinhole perspective, 70° horizontal field of view.
//   • Distant stars are unit directions (no parallax); a sparse near field
//     of sunlit particles has real positions and streams past.
//   • Special relativity: rapidity-based velocity addition, aberration,
//     Doppler (a blackbody at T looks like one at D·T), and the point-source
//     brightness law D² × visible-band Planck fraction. The engine's hard
//     limit is β = 0.6, where the pane is fuller than at rest and the sky
//     behind still holds a handful of reddened stars.
//   • Camera: a compressive knee tone map and a gain that only opens
//     (metered on nine pane directions plus streak loss), sensor grain when
//     the gain is high, exposure-conserving motion streaks.
//   • Attitude: Shuttle-style rate command with RCS rate hold. Thrust is
//     along the nose; velocity persists; turning does not turn the velocity.
// Warp is a labelled MODEL (every conceit carries an "M" in the HUD):
//   an Alcubierre-like bubble whose interior is locally at rest (γ = 1). To
//   engage, the ship first brakes to rest; in cruise, stars get finite
//   distances and drift with a compressed chronometer; a Mach-cone shadow
//   with a caustic ring sits astern and the wall tints the sky.
// Plus an electric discharge at the cursor while it moves.

type Key = "w" | "a" | "s" | "d";
const KEYS: Key[] = ["w", "a", "s", "d"];

type Vec3 = { x: number; y: number; z: number };

type Particle = Vec3 & { albedo: number; psx: number; psy: number };

type Star = {
  n: Vec3; // unit direction, camera frame
  p: Vec3; // position in light-years, used only in warp
  temp: number;
  flux: number; // relative, 1 = magnitude 0
  lum: number; // flux × d² at warp engage, so brightness follows 1/d² in warp
  psx: number;
  psy: number;
};

type Filament = {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  width: number;
  hue: number;
  gen: number;
};

type Mode = "sub" | "engaging" | "warp" | "disengaging";

const TAU = Math.PI * 2;

// ---- Camera & scene --------------------------------------------------------
const HFOV = (70 * Math.PI) / 180;
const Z_NEAR = 0.05;
const Z_FAR = 1;
const N_STARS = 480; // whole sky; ~34 in the pane at rest, ~110 at β 0.6

// ---- Kinematics (per 60 fps frame) ------------------------------------------
const ACCEL = 0.0025; // proper acceleration, c per frame (0.15 c/s)
const BETA_MAX = 0.6; // engine limit
const PHI_MAX = Math.atanh(BETA_MAX);
const BETA_0 = 0.06; // coasting speed on arrival
const C_SCENE = 0.0667; // scene units per frame at β = 1
const YAW_CMD = (25 * Math.PI) / 180 / 60; // commanded rate at full deflection
const YAW_ACCEL = (60 * Math.PI) / 180 / 3600; // what the RCS can deliver

// ---- Photometry --------------------------------------------------------------
const E0 = 9; // base exposure: a mag 4.3 star reads ~16% grey
const E_MIN = 0.04; // below this a source is not drawn
const G_MAX = 32; // camera gain ceiling
const PARTICLE_LUM = 0.0187;
const SUN_T = 5800;
const MAG_LO = -1.5;
const MAG_HI = 4.3;
const SPECTRAL: { T: number; w: number }[] = [
  { T: 35000, w: 0.01 },
  { T: 15000, w: 0.22 },
  { T: 8500, w: 0.22 },
  { T: 6500, w: 0.12 },
  { T: 5700, w: 0.13 },
  { T: 4500, w: 0.24 },
  { T: 3300, w: 0.06 },
];

// ---- Warp model ----------------------------------------------------------------
const ARM_S = 1.5;
const ENGAGE_S = 1.5;
const DISENGAGE_S = 0.4;
const VS = 5; // bubble speed in c (model)
const CLOCK = 4e8; // chronometer compression (model): ~63 ly per second
const LY_PER_FRAME = (VS * CLOCK) / 3.156e7 / 60; // ≈ 1.06 ly per frame
const WARP_D_MIN = 60; // initial star distances at engage, ly (log-uniform)
const WARP_D_MAX = 1000;
const PULSE_S = 0.7; // bubble wall forming / collapsing (model)
const MU = Math.asin(1 / VS); // aft shadow half-angle (model)
const WALL = 1.3; // wall tint, D ahead (model)

// Blackbody colour (Tanner Helland's fit), tabulated every 100 K.
const blackbody = (T: number): [number, number, number] => {
  const t = Math.min(40000, Math.max(1000, T)) / 100;
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = t <= 66 ? 255 : clamp(329.698727446 * Math.pow(t - 60, -0.1332047592));
  const g =
    t <= 66
      ? clamp(99.4708025861 * Math.log(t) - 161.1195681661)
      : clamp(288.1221695283 * Math.pow(t - 60, -0.0755148492));
  const b =
    t >= 66 ? 255 : t <= 19 ? 0 : clamp(138.5177312231 * Math.log(t - 10) - 305.0447927307);
  return [r, g, b];
};
const BB_MIN = 1000;
const BB_STEP = 100;
const BB_LUT: [number, number, number][] = [];
for (let T = BB_MIN; T <= 40000; T += BB_STEP) BB_LUT.push(blackbody(T));
const bb = (T: number) =>
  BB_LUT[Math.max(0, Math.min(BB_LUT.length - 1, Math.round((T - BB_MIN) / BB_STEP)))];

// Fraction of a blackbody's power emitted between 400 and 700 nm.
const planckCum = (z: number) => {
  let s = 0;
  for (let i = 1; i <= 20; i++) {
    const e = Math.exp(-i * z);
    s += (e / i) * (z * z * z + (3 * z * z) / i + (6 * z) / (i * i) + 6 / (i * i * i));
  }
  return (s * 15) / 97.40909103;
};
const fvisRaw = (T: number) => planckCum(14388 / (0.7 * T)) - planckCum(14388 / (0.4 * T));
const FV_MIN = 1000;
const FV_STEP = 100;
const FV_LUT: number[] = [];
for (let T = FV_MIN; T <= 80000; T += FV_STEP) FV_LUT.push(fvisRaw(T));
const fvis = (T: number) =>
  FV_LUT[Math.max(0, Math.min(FV_LUT.length - 1, Math.round((T - FV_MIN) / FV_STEP)))];
const F_SUN = fvis(SUN_T);

// Visible-band brightness factor for a point source of temperature T seen
// with Doppler factor D: photon count ×D, photon energy ×D, band fraction.
const boostFor = (T: number, D: number) => (D * D * fvis(T * D)) / fvis(T);

const knee = (e: number) => (e <= 1 ? e : 1 + Math.log(e));
const tone = (c: number, e: number) => 255 * (1 - Math.exp((-e * c) / 255));

const pickTemp = () => {
  let u = Math.random();
  for (const s of SPECTRAL) {
    u -= s.w;
    if (u <= 0) return s.T * (0.92 + Math.random() * 0.16);
  }
  return SPECTRAL[SPECTRAL.length - 1].T;
};
const sampleMag = () => {
  const a = Math.pow(10, 0.5 * MAG_LO);
  const b = Math.pow(10, 0.5 * MAG_HI);
  return 2 * Math.log10(a + Math.random() * (b - a));
};

const rotY = (p: Vec3, c: number, s: number) => {
  const x = p.x * c + p.z * s;
  p.z = -p.x * s + p.z * c;
  p.x = x;
};
const norm = (p: Vec3) => {
  const l = Math.hypot(p.x, p.y, p.z) || 1;
  p.x /= l;
  p.y /= l;
  p.z /= l;
};

// ---- Beacons: the three sections as fixed sky directions --------------------
const BEACONS = [
  { href: "/about", index: "01", label: "About", az: -24, el: 9 },
  { href: "/writing", index: "02", label: "Writing", az: 4, el: 14 },
  { href: "/projects", index: "03", label: "Projects", az: 27, el: 7 },
] as const;
const beaconDir = (az: number, el: number): Vec3 => {
  const a = (az * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  return { x: Math.sin(a) * Math.cos(e), y: -Math.sin(e), z: Math.cos(a) * Math.cos(e) };
};

export default function StarfieldPlasma() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLParagraphElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const beaconRefs = useRef<(HTMLAnchorElement | null)[]>([null, null, null]);
  const hoverRef = useRef(-1);
  const keyRefs = useRef<Record<Key, HTMLSpanElement | null>>({
    w: null,
    a: null,
    s: null,
    d: null,
  });
  const keysRef = useRef<Record<Key, boolean>>({ w: false, a: false, s: false, d: false });
  const flownRef = useRef(false);

  const setKey = useCallback((k: Key, down: boolean) => {
    keysRef.current[k] = down;
    const el = keyRefs.current[k];
    if (el) {
      if (down) el.setAttribute("data-active", "");
      else el.removeAttribute("data-active");
    }
    if (down && !flownRef.current) {
      flownRef.current = true;
      hudRef.current?.removeAttribute("data-hint");
      promptRef.current?.removeAttribute("data-show");
    }
  }, []);

  const go = useCallback(
    (href: string) => {
      fadeRef.current?.setAttribute("data-on", "");
      window.setTimeout(() => router.push(href), 260);
    },
    [router]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let width = 0;
    let height = 0;
    let cx = 0;
    let cy = 0;
    let focal = 0;
    let tanH = 0;
    let tanV = 0;

    // ---- Ship state, camera frame (+z out the nose, +y down the pane) ------
    const u: Vec3 = { x: 0, y: 0, z: reduce ? 0 : BETA_0 }; // β-vector
    let beta = 0;
    let gamma = 1;
    const vhat: Vec3 = { x: 0, y: 0, z: 1 };
    let omega = 0;
    let heading = 0;
    let thrustIn = 0;
    let limiter = false;
    let rcsFiring = false;
    let sLatch = false; // S must be released after leaving warp

    let mode: Mode = "sub";
    let armT = 0;
    let modeT = 0;
    let fx = 0; // warp effects 0..1
    let particleAlpha = 1;
    let pulseT = -1; // bubble wall pulse, seconds since trigger (−1 = idle)
    let distLy = 0; // light-years covered in warp (model)
    const axis: Vec3 = { x: 0, y: 0, z: 1 }; // bubble axis, fixed in space

    // Camera gain, metered on nine pane directions plus streak loss.
    let adapt = 1;
    let streakS = 1;
    let dopNose = 1;

    // ---- Sky -------------------------------------------------------------------
    const stars: Star[] = [];
    for (let i = 0; i < N_STARS; i++) {
      const z = Math.random() * 2 - 1;
      const phi = Math.random() * TAU;
      const r = Math.sqrt(1 - z * z);
      stars.push({
        n: { x: r * Math.cos(phi), y: r * Math.sin(phi), z },
        p: { x: 0, y: 0, z: 0 },
        temp: pickTemp(),
        flux: Math.pow(10, -0.4 * sampleMag()),
        lum: 0,
        psx: NaN,
        psy: NaN,
      });
    }
    const beacons: Vec3[] = BEACONS.map((b) => beaconDir(b.az, b.el));
    const labelW = [96, 96, 96];
    const measure = () => {
      beaconRefs.current.forEach((a, i) => {
        if (a) labelW[i] = a.offsetWidth || labelW[i];
      });
    };

    // ---- Near field ----------------------------------------------------------
    let particles: Particle[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const seedParticle = (p: Particle) => {
      p.z = Math.cbrt(rnd(Z_NEAR ** 3, Z_FAR ** 3));
      p.x = rnd(-1, 1) * p.z * tanH;
      p.y = rnd(-1, 1) * p.z * tanV;
      p.albedo = rnd(0.3, 1);
      p.psx = NaN;
      p.psy = NaN;
    };
    // Re-enter through whichever frustum face the field flows in through,
    // weighted by inflow, so nothing pops into view mid-pane.
    const respawnParticle = (p: Particle) => {
      const zm = (Z_NEAR + Z_FAR) / 2;
      const ux = -u.x * C_SCENE - omega * zm;
      const uy = -u.y * C_SCENE;
      const uz = -u.z * C_SCENE;
      const span = Z_FAR * Z_FAR - Z_NEAR * Z_NEAR;
      const wFar = Math.max(0, -uz) * 4 * Z_FAR * Z_FAR * tanH * tanV;
      const wNear = Math.max(0, uz) * 4 * Z_NEAR * Z_NEAR * tanH * tanV;
      const wPx = Math.max(0, -(ux - uz * tanH)) * tanV * span;
      const wNx = Math.max(0, ux + uz * tanH) * tanV * span;
      const wPy = Math.max(0, -(uy - uz * tanV)) * tanH * span;
      const wNy = Math.max(0, uy + uz * tanV) * tanH * span;
      const total = wFar + wNear + wPx + wNx + wPy + wNy;
      const zSide = () => Math.sqrt(rnd(Z_NEAR * Z_NEAR, Z_FAR * Z_FAR));
      const M = 1.04;
      let pick = Math.random() * total;
      if (total <= 0 || (pick -= wFar) < 0) {
        p.z = Z_FAR * M;
        p.x = rnd(-1, 1) * p.z * tanH;
        p.y = rnd(-1, 1) * p.z * tanV;
      } else if ((pick -= wNear) < 0) {
        p.z = Z_NEAR;
        p.x = rnd(-1, 1) * p.z * tanH;
        p.y = rnd(-1, 1) * p.z * tanV;
      } else if ((pick -= wPx) < 0) {
        p.z = zSide();
        p.x = p.z * tanH * M;
        p.y = rnd(-1, 1) * p.z * tanV;
      } else if ((pick -= wNx) < 0) {
        p.z = zSide();
        p.x = -p.z * tanH * M;
        p.y = rnd(-1, 1) * p.z * tanV;
      } else if ((pick -= wPy) < 0) {
        p.z = zSide();
        p.y = p.z * tanV * M;
        p.x = rnd(-1, 1) * p.z * tanH;
      } else {
        p.z = zSide();
        p.y = -p.z * tanV * M;
        p.x = rnd(-1, 1) * p.z * tanH;
      }
      p.albedo = rnd(0.3, 1);
      p.psx = NaN;
      p.psy = NaN;
    };
    const buildParticles = () => {
      const count = Math.max(24, Math.round((width * height) / 26000));
      particles = Array.from({ length: count }, () => {
        const p: Particle = { x: 0, y: 0, z: 0, albedo: 1, psx: NaN, psy: NaN };
        seedParticle(p);
        return p;
      });
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      cx = width / 2;
      cy = height / 2;
      tanH = Math.tan(HFOV / 2);
      tanV = (tanH * height) / width;
      focal = width / 2 / tanH;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildParticles();
      measure();
    };
    resize();

    const makeRadial = (stops: [number, string][]) => {
      const size = 48;
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const g = c.getContext("2d")!;
      const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      for (const [o, col] of stops) grd.addColorStop(o, col);
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
      return c;
    };
    const glow = makeRadial([
      [0, "rgba(255,255,255,0.6)"],
      [0.25, "rgba(255,255,255,0.18)"],
      [0.6, "rgba(255,255,255,0.04)"],
      [1, "rgba(255,255,255,0)"],
    ]);
    const arcGlow = makeRadial([
      [0, "rgba(255,255,255,0.95)"],
      [0.1, "rgba(190,250,255,0.7)"],
      [0.32, "rgba(40,210,255,0.28)"],
      [0.7, "rgba(40,120,255,0.08)"],
      [1, "rgba(40,120,255,0)"],
    ]);

    // ---- Relativity --------------------------------------------------------------
    const tmp: Vec3 = { x: 0, y: 0, z: 0 };
    const tmp2: Vec3 = { x: 0, y: 0, z: 0 };
    // Aberrate a unit direction; returns the Doppler factor D.
    const aberrate = (n: Vec3, out: Vec3) => {
      if (beta < 1e-3) {
        out.x = n.x;
        out.y = n.y;
        out.z = n.z;
        return 1;
      }
      const nd = n.x * vhat.x + n.y * vhat.y + n.z * vhat.z;
      const D = gamma * (1 + beta * nd);
      const kp = (gamma - 1) * nd + gamma * beta;
      out.x = (n.x + kp * vhat.x) / D;
      out.y = (n.y + kp * vhat.y) / D;
      out.z = (n.z + kp * vhat.z) / D;
      return D;
    };
    // Relativistic velocity addition for a push w along the nose.
    const push = (w: number) => {
      const b2 = u.x * u.x + u.y * u.y + u.z * u.z;
      const gu = 1 / Math.sqrt(Math.max(1e-12, 1 - b2));
      const uw = u.z * w;
      const f = (gu / (1 + gu)) * uw;
      const den = 1 + uw;
      u.x = (u.x + f * u.x) / den;
      u.y = (u.y + f * u.y) / den;
      u.z = (u.z + w / gu + f * u.z) / den;
    };
    const refreshBeta = () => {
      beta = Math.hypot(u.x, u.y, u.z);
      limiter = false;
      if (beta > BETA_MAX) {
        const s = BETA_MAX / beta;
        u.x *= s;
        u.y *= s;
        u.z *= s;
        beta = BETA_MAX;
        limiter = true;
      } else if (beta > BETA_MAX - 0.005) limiter = true;
      gamma = 1 / Math.sqrt(1 - beta * beta);
      if (beta > 1e-9) {
        vhat.x = u.x / beta;
        vhat.y = u.y / beta;
        vhat.z = u.z / beta;
      }
    };

    // ---- Drawing -------------------------------------------------------------------
    let sumE = 0;
    let sumEs = 0;
    const paint = (
      sx: number,
      sy: number,
      psx: number,
      psy: number,
      e: number,
      rgb: [number, number, number]
    ) => {
      const r = Math.min(3.6, 0.45 + 0.9 * Math.pow(Math.min(e, 60), 0.3));
      let spread = 1;
      let streak = false;
      if (!Number.isNaN(psx)) {
        const L = Math.hypot(sx - psx, sy - psy);
        if (L > 0.6) {
          streak = true;
          spread = Math.max(1, L / (2 * r));
        }
      }
      sumE += e;
      sumEs += e / spread;
      const ee = knee(e / spread);
      if (ee < E_MIN) return;
      const col = `rgb(${tone(rgb[0], ee) | 0}, ${tone(rgb[1], ee) | 0}, ${tone(rgb[2], ee) | 0})`;
      if (streak) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2 * r;
        ctx.beginPath();
        ctx.moveTo(psx, psy);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      } else {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU);
        ctx.fill();
      }
      if (ee > 4) {
        const g = r * 8;
        ctx.globalAlpha = Math.min(0.5, 0.1 * Math.log(ee));
        ctx.drawImage(glow, sx - g / 2, sy - g / 2, g, g);
        ctx.globalAlpha = 1;
      }
    };

    const onPane = (sx: number, sy: number, m = 30) =>
      sx >= -m && sx <= width + m && sy >= -m && sy <= height + m;

    // Warp wall: aft Mach shadow with a caustic ring, mild tint (model).
    const warpDir = (n: Vec3, out: Vec3) => {
      out.x = n.x;
      out.y = n.y;
      out.z = n.z;
      if (fx <= 0) return 1;
      const ca = -(n.x * axis.x + n.y * axis.y + n.z * axis.z); // cos from anti-axis
      if (ca > 0) {
        const tha = Math.acos(Math.min(1, ca));
        const target = MU + (Math.PI / 2 - MU) * Math.pow((2 * tha) / Math.PI, 3);
        const th2 = tha + fx * (target - tha);
        // perpendicular component of n relative to the anti-axis
        let px = n.x + ca * axis.x;
        let py = n.y + ca * axis.y;
        let pz = n.z + ca * axis.z;
        const pl = Math.hypot(px, py, pz);
        if (pl < 1e-6) {
          px = axis.y;
          py = -axis.x;
          pz = 0;
          const l2 = Math.hypot(px, py, pz) || 1;
          px /= l2;
          py /= l2;
          pz /= l2;
        } else {
          px /= pl;
          py /= pl;
          pz /= pl;
        }
        const c2 = Math.cos(th2);
        const s2 = Math.sin(th2);
        out.x = -axis.x * c2 + px * s2;
        out.y = -axis.y * c2 + py * s2;
        out.z = -axis.z * c2 + pz * s2;
      }
      const along = out.x * axis.x + out.y * axis.y + out.z * axis.z;
      return Math.pow(WALL, fx * along);
    };

    const drawSky = (k: number) => {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      sumE = 0;
      sumEs = 0;
      const g = adapt;
      const warpMotion = mode === "warp" || mode === "disengaging";
      const speedScale = mode === "disengaging" ? Math.max(0, 1 - modeT / DISENGAGE_S) : 1;

      for (const st of stars) {
        let flux = st.flux;
        if (warpMotion) {
          const step = LY_PER_FRAME * k * speedScale;
          st.p.x -= axis.x * step;
          st.p.y -= axis.y * step;
          st.p.z -= axis.z * step;
          let d2 = st.p.x * st.p.x + st.p.y * st.p.y + st.p.z * st.p.z;
          if (st.p.x * axis.x + st.p.y * axis.y + st.p.z * axis.z < -200 || d2 > 2.25e6) {
            // Re-enter far ahead, close to the axis and dim; it swells and
            // slides outward as it approaches, so the flow is a tunnel.
            const d = 400 + Math.random() * 600;
            const z = Math.random() * 2 - 1;
            const phi = Math.random() * TAU;
            const r = Math.sqrt(1 - z * z);
            tmp.x = axis.x + r * Math.cos(phi) * 0.55;
            tmp.y = axis.y + r * Math.sin(phi) * 0.55;
            tmp.z = axis.z + z * 0.55;
            norm(tmp);
            st.p.x = tmp.x * d;
            st.p.y = tmp.y * d;
            st.p.z = tmp.z * d;
            d2 = d * d;
            st.psx = NaN;
          }
          st.n.x = st.p.x;
          st.n.y = st.p.y;
          st.n.z = st.p.z;
          norm(st.n);
          flux = st.lum / Math.max(100, d2);
        }
        const Dw = warpDir(st.n, tmp2);
        const D = aberrate(tmp2, tmp);
        if (tmp.z < 0.03) {
          st.psx = NaN;
          continue;
        }
        const sx = cx + (focal * tmp.x) / tmp.z;
        const sy = cy + (focal * tmp.y) / tmp.z;
        if (!onPane(sx, sy)) {
          st.psx = NaN;
          continue;
        }
        const Dt = D * Dw;
        paint(sx, sy, st.psx, st.psy, E0 * g * flux * boostFor(st.temp, Dt), bb(st.temp * Dt));
        st.psx = sx;
        st.psy = sy;
      }

      if (particleAlpha > 0.01) {
        const vx = u.x * C_SCENE;
        const vy = u.y * C_SCENE;
        const vz = u.z * C_SCENE;
        for (const p of particles) {
          p.x -= vx * k;
          p.y -= vy * k;
          p.z -= vz * k;
          const out =
            p.z < Z_NEAR * 0.5 ||
            p.z > Z_FAR * 1.3 ||
            Math.abs(p.x) > p.z * tanH * 1.4 + 0.02 ||
            Math.abs(p.y) > p.z * tanV * 1.4 + 0.02;
          if (out) {
            respawnParticle(p);
            continue;
          }
          const d = Math.hypot(p.x, p.y, p.z);
          tmp.x = p.x / d;
          tmp.y = p.y / d;
          tmp.z = p.z / d;
          const D = aberrate(tmp, tmp);
          if (tmp.z < 0.03) {
            p.psx = NaN;
            continue;
          }
          const sx = cx + (focal * tmp.x) / tmp.z;
          const sy = cy + (focal * tmp.y) / tmp.z;
          if (!onPane(sx, sy)) {
            p.psx = NaN;
            continue;
          }
          const e =
            ((E0 * g * PARTICLE_LUM * p.albedo) / (d * d)) *
            ((D * D * fvis(SUN_T * D)) / F_SUN) *
            particleAlpha;
          paint(sx, sy, p.psx, p.psy, e, bb(SUN_T * D));
          p.psx = sx;
          p.psy = sy;
        }
      }
      streakS = sumE > 0 ? Math.max(0.2, sumEs / sumE) : 1;
      ctx.globalCompositeOperation = "source-over";
    };

    // Bubble wall forming or collapsing: one ring sweeping out from the axis.
    const drawPulse = (dt: number) => {
      if (pulseT < 0) return;
      pulseT += dt;
      if (pulseT > PULSE_S) {
        pulseT = -1;
        return;
      }
      if (axis.z < 0.05) return;
      const q = pulseT / PULSE_S;
      const ease = 1 - Math.pow(1 - q, 3);
      const ang = ease * 1.25; // radians off-axis reached by the wall
      const r = focal * Math.tan(Math.min(1.45, ang));
      const mx = cx + (focal * axis.x) / axis.z;
      const my = cy + (focal * axis.y) / axis.z;
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "butt";
      ctx.strokeStyle = `rgba(167, 139, 250, ${(0.55 * (1 - q)).toFixed(3)})`;
      ctx.lineWidth = 1.5 + 6 * q;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = `rgba(103, 232, 249, ${(0.35 * (1 - q)).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mx, my, r * 0.985, 0, TAU);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    };

    const drawRing = () => {
      if (fx <= 0.01) return;
      // Basis perpendicular to the axis.
      const ax = axis.x;
      const ay = axis.y;
      const az = axis.z;
      let e1x = -ay;
      let e1y = ax;
      let e1z = 0;
      const l1 = Math.hypot(e1x, e1y, e1z);
      if (l1 < 1e-6) {
        e1x = 1;
        e1y = 0;
        e1z = 0;
      } else {
        e1x /= l1;
        e1y /= l1;
        e1z /= l1;
      }
      const e2x = ay * e1z - az * e1y;
      const e2y = az * e1x - ax * e1z;
      const e2z = ax * e1y - ay * e1x;
      const cm = Math.cos(MU);
      const sm = Math.sin(MU);
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(167, 139, 250, ${(0.42 * fx).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.lineCap = "butt";
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= 72; i++) {
        const ph = (i / 72) * TAU;
        const cp = Math.cos(ph) * sm;
        const sp = Math.sin(ph) * sm;
        const dx = -ax * cm + e1x * cp + e2x * sp;
        const dy = -ay * cm + e1y * cp + e2y * sp;
        const dz = -az * cm + e1z * cp + e2z * sp;
        if (dz < 0.03) {
          pen = false;
          continue;
        }
        const sx = cx + (focal * dx) / dz;
        const sy = cy + (focal * dy) / dz;
        if (pen) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
        pen = true;
      }
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    };

    // Read noise brought up by camera gain: neutral speckle.
    const drawGrain = () => {
      const g = adapt;
      if (g < 1.5) return;
      const n = Math.min(900, Math.floor(((g - 1) * 14 * (width * height)) / 600000));
      const amp = Math.min(1, Math.sqrt(g / 16));
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgb(56, 52, 50)";
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = (0.2 + Math.random() * 0.5) * amp;
        ctx.fillRect(Math.random() * width, Math.random() * height, 1, 1);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    // Prograde / retrograde marker, or the bubble axis in warp (diamond).
    let markerName = "—";
    const drawMarker = () => {
      markerName = "—";
      if (!flownRef.current) return;
      let dx: number;
      let dy: number;
      let dz: number;
      let kind: "pro" | "retro" | "axis";
      if (mode === "warp" || mode === "engaging") {
        dx = axis.x;
        dy = axis.y;
        dz = axis.z;
        kind = "axis";
      } else {
        if (beta < 1e-4) return;
        dx = vhat.x;
        dy = vhat.y;
        dz = vhat.z;
        kind = "pro";
        if (dz < 0) {
          dx = -dx;
          dy = -dy;
          dz = -dz;
          kind = "retro";
        }
      }
      markerName = kind === "pro" ? "prograde" : kind === "retro" ? "retro" : "axis";
      if (dz < 0.05) return;
      const mx = cx + (focal * dx) / dz;
      const my = cy + (focal * dy) / dz;
      if (mx < 16 || mx > width - 16 || my < 16 || my > height - 16) return;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      ctx.lineCap = "butt";
      if (kind === "axis") {
        ctx.strokeStyle = "rgba(167, 139, 250, 0.6)";
        ctx.beginPath();
        ctx.moveTo(mx, my - 8);
        ctx.lineTo(mx + 8, my);
        ctx.lineTo(mx, my + 8);
        ctx.lineTo(mx - 8, my);
        ctx.closePath();
        ctx.stroke();
        return;
      }
      ctx.strokeStyle = "rgba(125, 211, 252, 0.5)";
      ctx.fillStyle = "rgba(125, 211, 252, 0.6)";
      ctx.beginPath();
      ctx.arc(mx, my, 7, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx, my - 7);
      ctx.lineTo(mx, my - 12);
      ctx.moveTo(mx - 7, my);
      ctx.lineTo(mx - 12, my);
      ctx.moveTo(mx + 7, my);
      ctx.lineTo(mx + 12, my);
      if (kind === "retro") {
        ctx.moveTo(mx - 4, my - 4);
        ctx.lineTo(mx + 4, my + 4);
        ctx.moveTo(mx - 4, my + 4);
        ctx.lineTo(mx + 4, my - 4);
      }
      ctx.stroke();
      if (kind === "pro") {
        ctx.beginPath();
        ctx.arc(mx, my, 1, 0, TAU);
        ctx.fill();
      }
    };

    // Beacons: reticle on the canvas at the aberrated image, label in the DOM
    // clamped into a safe rectangle so it is always reachable.
    const drawBeacons = () => {
      const x0 = 24;
      const x1 = width - 24;
      const y0 = 72;
      const y1 = height * 0.68;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      ctx.lineCap = "butt";
      beacons.forEach((b, i) => {
        const a = beaconRefs.current[i];
        aberrate(b, tmp);
        let ix: number;
        let iy: number;
        const behind = tmp.z <= 0.03;
        if (behind) {
          const L = Math.hypot(tmp.x, tmp.y) || 1;
          ix = cx + (tmp.x / L) * 1e4;
          iy = cy + (tmp.y / L) * 1e4;
        } else {
          ix = cx + (focal * tmp.x) / tmp.z;
          iy = cy + (focal * tmp.y) / tmp.z;
        }
        const lw = labelW[i];
        const lh = 18;
        const wantX = ix + 14;
        const wantY = iy;
        const lx = Math.min(Math.max(wantX, x0), Math.max(x0, x1 - lw));
        const ly = Math.min(Math.max(wantY, y0 + lh / 2), Math.max(y0 + lh / 2, y1 - lh / 2));
        const clamped = behind || lx !== wantX || ly !== wantY;
        const hot = hoverRef.current === i;
        const col = hot ? "rgba(103, 232, 249," : "rgba(196, 181, 253,";

        if (!behind && onPane(ix, iy, 12)) {
          const r = hot ? 9 : 6;
          ctx.strokeStyle = `${col} 0.55)`;
          ctx.beginPath();
          ctx.arc(ix, iy, r, 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          for (let q = 0; q < 4; q++) {
            const ang = (q * Math.PI) / 2;
            const c = Math.cos(ang);
            const s = Math.sin(ang);
            ctx.moveTo(ix + c * (r + 2), iy + s * (r + 2));
            ctx.lineTo(ix + c * (r + 6), iy + s * (r + 6));
          }
          ctx.stroke();
          if (hot) {
            ctx.strokeStyle = `${col} 0.3)`;
            ctx.beginPath();
            ctx.arc(ix, iy, r + 5, 0, TAU);
            ctx.stroke();
          }
        }
        // Leader from the label edge that faces the image.
        const fromRight = clamped && ix > lx + lw / 2;
        const ox = fromRight ? lx + lw + 4 : lx - 4;
        const ddx = ix - ox;
        const ddy = iy - ly;
        const dl = Math.hypot(ddx, ddy) || 1;
        const reach = clamped ? Math.min(dl, 22) : Math.max(0, dl - (hot ? 11 : 8));
        ctx.strokeStyle = `${col} ${hot ? 0.6 : 0.3})`;
        ctx.beginPath();
        ctx.moveTo(ox, ly);
        ctx.lineTo(ox + (ddx / dl) * reach, ly + (ddy / dl) * reach);
        ctx.stroke();

        if (a) {
          a.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px) translateY(-50%)`;
          if (clamped) a.setAttribute("data-clamped", "");
          else a.removeAttribute("data-clamped");
          const chev = a.lastElementChild as HTMLElement | null;
          if (chev) chev.style.transform = `rotate(${Math.atan2(ddy, ddx)}rad)`;
        }
      });
    };

    // Reduced motion: one still frame at rest, beacons static.
    if (reduce) {
      const renderStatic = () => {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#06060c";
        ctx.fillRect(0, 0, width, height);
        drawSky(0);
        drawBeacons();
      };
      renderStatic();
      const onResize = () => {
        resize();
        renderStatic();
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    // ---- Electric discharge at the cursor ------------------------------------
    const filaments: Filament[] = [];
    const pointer = { x: -9999, y: -9999, lastMove: -9999 };
    let t = 0;
    const pointerMoving = () => pointer.lastMove >= 0 && t - pointer.lastMove <= 5;
    const spawnFilament = (x: number, y: number, ang: number, speed: number, gen: number) => {
      if (filaments.length > 240) return;
      const vx = Math.cos(ang) * speed;
      const vy = Math.sin(ang) * speed;
      filaments.push({
        x,
        y,
        px: x - vx,
        py: y - vy,
        vx,
        vy,
        life: 0,
        maxLife: (Math.random() * 5 + 6) * (gen === 0 ? 1 : 0.7),
        width: (Math.random() * 0.35 + 0.35) * (gen === 0 ? 1 : 0.7),
        hue: gen === 0 ? 186 + Math.random() * 14 : 205 + Math.random() * 22,
        gen,
      });
    };
    const drawSpark = () => {
      const ARC_RADIUS = 33;
      if (!pointerMoving()) filaments.length = 0;
      else if (filaments.length <= 200)
        for (let i = 0; i < 2; i++)
          spawnFilament(pointer.x, pointer.y, Math.random() * TAU, Math.random() * 1.65 + 1.05, 0);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (let i = filaments.length - 1; i >= 0; i--) {
        const p = filaments[i];
        p.life += 1;
        if (p.life >= p.maxLife) {
          filaments.splice(i, 1);
          continue;
        }
        const wobble = (Math.random() - 0.5) * 0.9;
        const c = Math.cos(wobble);
        const s = Math.sin(wobble);
        const nvx = p.vx * c - p.vy * s;
        const nvy = p.vx * s + p.vy * c;
        p.vx = nvx;
        p.vy = nvy;
        if (Math.random() < 0.28) {
          const len = Math.hypot(p.vx, p.vy) || 1;
          const kick = (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 1.05);
          p.vx += (-p.vy / len) * kick;
          p.vy += (nvx / len) * kick;
        }
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.px = p.x;
        p.py = p.y;
        p.x += p.vx;
        p.y += p.vy;
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        if (dx * dx + dy * dy > ARC_RADIUS * ARC_RADIUS) {
          filaments.splice(i, 1);
          continue;
        }
        if (p.gen < 1 && p.life > 2 && Math.random() < 0.12) {
          const ang =
            Math.atan2(p.vy, p.vx) + (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.8);
          spawnFilament(p.x, p.y, ang, Math.min(2.1, Math.hypot(p.vx, p.vy) * 0.85), p.gen + 1);
        }
        const fade = Math.sin((p.life / p.maxLife) * Math.PI);
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.globalAlpha = fade * 0.22;
        ctx.strokeStyle = `hsl(${Math.min(230, p.hue + 18)}, 100%, 58%)`;
        ctx.lineWidth = p.width * 2.4;
        ctx.stroke();
        ctx.globalAlpha = fade * 0.8;
        ctx.strokeStyle = `hsl(${p.hue}, 100%, 64%)`;
        ctx.lineWidth = p.width * 1.05;
        ctx.stroke();
        ctx.globalAlpha = fade;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
        ctx.lineWidth = Math.max(0.55, p.width * 0.38);
        ctx.stroke();
        const tip = p.width * 3;
        ctx.globalAlpha = fade * 0.55;
        ctx.drawImage(arcGlow, p.x - tip / 2, p.y - tip / 2, tip, tip);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    // ---- HUD ---------------------------------------------------------------------
    const fields = new Map<string, HTMLElement>();
    const field = (name: string) => {
      let el = fields.get(name);
      if (!el && hudRef.current) {
        el = hudRef.current.querySelector<HTMLElement>(`[data-f="${name}"]`) ?? undefined;
        if (el) fields.set(name, el);
      }
      return el;
    };
    const setText = (name: string, text: string) => {
      const el = field(name);
      if (el && el.textContent !== text) el.textContent = text;
    };
    const updateHud = () => {
      const hud = hudRef.current;
      if (!hud) return;
      const warpish = mode === "warp" || mode === "engaging";
      hud.setAttribute("data-mode", warpish ? "warp" : "sub");

      const badge = field("badge");
      if (badge) {
        let state = "sub";
        let text = "Sublight";
        if (warpish) {
          state = "warp";
          text = "Warp · model";
        } else if (mode === "sub" && armT > 0) {
          state = "arm";
          text = `Warp arm ${Math.min(99, Math.floor((armT / ARM_S) * 100))
            .toString()
            .padStart(2, "0")}%`;
        } else if (mode === "sub" && limiter) {
          state = "limit";
          text = "Eng limit";
        }
        badge.setAttribute("data-state", state);
        if (badge.textContent !== text) badge.textContent = text;
      }
      const armbar = field("armbar");
      if (armbar) armbar.style.transform = `scaleX(${mode === "sub" ? Math.min(1, armT / ARM_S) : 0})`;

      setText("vel", `${beta.toFixed(2)} c`);
      const velbar = field("velbar");
      if (velbar) velbar.style.transform = `scaleX(${(beta / BETA_MAX).toFixed(3)})`;
      setText("vs", mode === "warp" ? `${VS.toFixed(1)} c` : mode === "engaging" ? "forming" : "—");
      setText(
        "dst",
        mode === "warp" ? `${Math.round(distLy).toLocaleString("en-US")} ly` : "—"
      );

      const thr = field("thrbar");
      if (thr) {
        const arming = mode === "sub" && armT > 0;
        thr.style.transform = `scaleX(${arming ? 1 : Math.abs(thrustIn)})`;
        thr.setAttribute("data-kind", arming ? "arm" : thrustIn < 0 ? "retro" : "fwd");
      }
      const rcs = field("rcs");
      if (rcs) {
        if (rcsFiring) rcs.setAttribute("data-active", "");
        else rcs.removeAttribute("data-active");
      }

      setText("gamma", gamma.toFixed(2));
      setText("gain", `×${adapt < 10 ? adapt.toFixed(1) : adapt.toFixed(0)}`);
      const dopShown = warpish ? Math.pow(WALL, fx) : dopNose;
      setText("doplabel", warpish ? "wall" : "dop");
      setText("dop", `×${dopShown.toFixed(2)}`);
      const spec = field("spec");
      if (spec) {
        const lambda = 550 / dopShown;
        const x = Math.max(0, Math.min(1, (700 - lambda) / 300));
        spec.style.left = `${(x * 100).toFixed(1)}%`;
        spec.style.opacity = x <= 0 || x >= 1 ? "0.45" : "1";
      }
      setText("clk", mode === "warp" ? "×4e8" : "×1");

      setText("hdg", `${String(Math.round(heading) % 360).padStart(3, "0")}°`);
      const degs = (omega * 60 * 180) / Math.PI;
      setText("yaw", `${degs < -0.05 ? "−" : "+"}${Math.abs(degs).toFixed(1)}°/s`);
      setText("mkr", markerName);
      const mkr = field("mkr");
      if (mkr) {
        if (markerName === "axis") mkr.setAttribute("data-model", "");
        else mkr.removeAttribute("data-model");
      }
    };

    // ---- Main loop ---------------------------------------------------------------
    let raf = 0;
    let last = performance.now();
    const meterDirs: Vec3[] = [];
    const rebuildMeter = () => {
      meterDirs.length = 0;
      for (const [mx, my] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        const d: Vec3 = { x: mx * tanH, y: my * tanV, z: 1 };
        norm(d);
        meterDirs.push(d);
      }
    };
    rebuildMeter();

    const frame = (now: number) => {
      const k = Math.min(2.5, Math.max(0.25, (now - last) / 16.667));
      const dt = (k * 16.667) / 1000;
      last = now;
      t += 1;
      const keys = keysRef.current;

      // ---- Mode machine & kinematics ----
      if (mode === "sub") {
        if (!keys.s) sLatch = false;
        thrustIn = (keys.w ? 1 : 0) - (keys.s && !sLatch ? 1 : 0);
        if (thrustIn) push(thrustIn * ACCEL * k);
        refreshBeta();
        if (limiter && keys.w && thrustIn > 0) {
          armT += dt;
          if (armT >= ARM_S) {
            mode = "engaging";
            modeT = 0;
            armT = 0;
            axis.x = 0;
            axis.y = 0;
            axis.z = 1;
          }
        } else armT = 0;
      } else if (mode === "engaging") {
        thrustIn = 0;
        modeT += dt;
        const b = Math.tanh(PHI_MAX * Math.max(0, 1 - modeT / ENGAGE_S));
        u.x = vhat.x * b;
        u.y = vhat.y * b;
        u.z = vhat.z * b;
        refreshBeta();
        limiter = false;
        const tail = Math.max(0, (modeT - (ENGAGE_S - 0.4)) / 0.4);
        fx = Math.min(1, tail);
        particleAlpha = 1 - fx;
        if (modeT >= ENGAGE_S) {
          mode = "warp";
          modeT = 0;
          u.x = u.y = u.z = 0;
          refreshBeta();
          fx = 1;
          particleAlpha = 0;
          pulseT = 0;
          distLy = 0;
          for (const st of stars) {
            const d = Math.pow(
              10,
              Math.log10(WARP_D_MIN) + Math.random() * Math.log10(WARP_D_MAX / WARP_D_MIN)
            );
            st.p.x = st.n.x * d;
            st.p.y = st.n.y * d;
            st.p.z = st.n.z * d;
            st.lum = st.flux * d * d;
          }
        }
      } else if (mode === "warp") {
        thrustIn = 0;
        distLy += LY_PER_FRAME * k;
        if (keys.s) {
          mode = "disengaging";
          modeT = 0;
          sLatch = true;
          pulseT = 0;
          for (const p of particles) seedParticle(p);
        }
      } else {
        thrustIn = 0;
        modeT += dt;
        fx = Math.max(0, 1 - modeT / DISENGAGE_S);
        particleAlpha = 1 - fx;
        if (modeT >= DISENGAGE_S) {
          mode = "sub";
          fx = 0;
          particleAlpha = 1;
          refreshBeta();
        }
      }

      // ---- Attitude: rate command with RCS rate hold ----
      const omegaCmd = ((keys.d ? 1 : 0) - (keys.a ? 1 : 0)) * YAW_CMD;
      const dOmega = omegaCmd - omega;
      const step = YAW_ACCEL * k;
      rcsFiring = Math.abs(dOmega) > 1e-6;
      omega = Math.abs(dOmega) <= step ? omegaCmd : omega + Math.sign(dOmega) * step;
      const dpsi = omega * k;
      if (dpsi !== 0) {
        const c = Math.cos(dpsi);
        const s = -Math.sin(dpsi);
        rotY(u, c, s);
        rotY(axis, c, s);
        for (const st of stars) {
          rotY(st.n, c, s);
          rotY(st.p, c, s);
        }
        for (const p of particles) rotY(p, c, s);
        for (const b of beacons) rotY(b, c, s);
        heading = (heading + (dpsi * 180) / Math.PI + 360) % 360;
        if (beta > 1e-9) {
          vhat.x = u.x / beta;
          vhat.y = u.y / beta;
          vhat.z = u.z / beta;
        }
      }

      // ---- Camera gain: open only, metered on the pane plus streak loss ----
      dopNose = gamma * (1 + beta * vhat.z);
      let M = 0;
      for (const d of meterDirs) {
        const cs = d.x * vhat.x + d.y * vhat.y + d.z * vhat.z;
        const Dm = 1 / (gamma * (1 - beta * cs));
        M += (Dm * Dm * fvis(SUN_T * Dm)) / F_SUN;
      }
      M /= meterDirs.length;
      const gT = Math.min(G_MAX, Math.max(1, 1 / (M * streakS)));
      adapt += (gT - adapt) * 0.06 * k;

      // ---- Paint ----
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(6, 6, 12, 0.7)";
      ctx.fillRect(0, 0, width, height);

      drawSky(k);
      drawRing();
      drawPulse(dt);
      drawGrain();
      drawMarker();
      drawBeacons();
      drawSpark();
      if (t % 3 === 0) updateHud();

      raf = requestAnimationFrame(frame);
    };

    // ---- Input ---------------------------------------------------------------------
    const keyOf = (e: KeyboardEvent): Key | null => {
      const k = e.key.toLowerCase();
      return k === "w" || k === "a" || k === "s" || k === "d" ? (k as Key) : null;
    };
    const editable = (el: EventTarget | null) => {
      const h = el as HTMLElement | null;
      return !!h && (h.tagName === "INPUT" || h.tagName === "TEXTAREA" || h.isContentEditable);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || editable(e.target)) return;
      const k = keyOf(e);
      if (k) setKey(k, true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = keyOf(e);
      if (k) setKey(k, false);
    };
    const onBlur = () => KEYS.forEach((k) => setKey(k, false));
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
    const onResize = () => {
      resize();
      rebuildMeter();
    };
    const promptTimer = window.setTimeout(() => {
      if (!flownRef.current) promptRef.current?.setAttribute("data-show", "");
    }, 1500);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("resize", onResize);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(promptTimer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("resize", onResize);
    };
  }, [setKey]);

  const cap = (k: Key) => (
    <span
      key={k}
      ref={(el) => {
        keyRefs.current[k] = el;
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setKey(k, true);
      }}
      onPointerUp={() => setKey(k, false)}
      onPointerCancel={() => setKey(k, false)}
      onContextMenu={(e) => e.preventDefault()}
      className={`flex h-7 w-7 cursor-pointer touch-none items-center justify-center rounded-[5px] border border-violet-200/20 bg-white/[0.02] text-[11px] tracking-normal text-violet-100/60 normal-case transition-[color,border-color,box-shadow,background-color] duration-100 data-active:border-cyan-300/80 data-active:bg-cyan-300/10 data-active:text-cyan-50 data-active:shadow-[0_0_10px_rgba(103,232,249,0.45)] ${
        k === "w" ? "group-data-[hint]/hud:animate-pulse" : ""
      }`}
    >
      {k.toUpperCase()}
    </span>
  );

  const row = (label: string, f: string, init: string, extra?: string) => (
    <div className={`flex items-baseline gap-3 ${extra ?? ""}`}>
      <span className="text-zinc-500" data-f={f === "dop" ? "doplabel" : undefined}>
        {label}
      </span>
      <span data-f={f} className="text-violet-100/80">
        {init}
      </span>
    </div>
  );

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" />

      {/* Edge shading of the view pane. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(ellipse 75% 70% at 50% 50%, transparent 55%, rgba(3, 3, 8, 0.55) 100%)",
        }}
      />

      {/* Beacons: the three sections as sky waypoints. */}
      {BEACONS.map((b, i) => (
        <a
          key={b.href}
          href={b.href}
          ref={(el) => {
            beaconRefs.current[i] = el;
          }}
          onClick={(e) => {
            e.preventDefault();
            go(b.href);
          }}
          onPointerEnter={() => {
            hoverRef.current = i;
          }}
          onPointerLeave={() => {
            hoverRef.current = -1;
          }}
          onFocus={() => {
            hoverRef.current = i;
          }}
          onBlur={() => {
            hoverRef.current = -1;
          }}
          className="group/b pointer-events-auto fixed top-0 left-0 z-20 flex items-center gap-2 rounded-sm px-1 py-0.5 whitespace-nowrap outline-none select-none will-change-transform focus-visible:ring-1 focus-visible:ring-cyan-300"
          style={{ transform: "translate(-999px, -999px)" }}
        >
          <span className="font-mono text-[10px] tracking-[0.18em] text-zinc-500">{b.index}</span>
          <span className="font-cosmic text-[12px] font-bold tracking-[0.3em] text-zinc-200 uppercase transition-colors group-hover/b:text-cyan-200 group-focus-visible/b:text-cyan-200 group-data-[clamped]/b:text-zinc-400">
            {b.label}
          </span>
          <span
            aria-hidden="true"
            className="hidden text-[11px] leading-none text-zinc-500 group-data-[clamped]/b:inline"
          >
            ›
          </span>
        </a>
      ))}

      {/* Nameplate on the window frame. */}
      <div className="pointer-events-none fixed bottom-10 left-8 z-20 max-w-[36rem] sm:bottom-14">
        <p className="mb-4 font-display text-[11px] font-bold tracking-[0.4em] text-violet-300/60 uppercase">
          Welcome aboard
        </p>
        <h1
          className="font-cosmic text-[clamp(2.5rem,6vw,5rem)] leading-none font-black tracking-[0.04em] text-zinc-50 uppercase"
          style={{ textShadow: "0 0 28px rgba(167, 139, 250, 0.22)" }}
        >
          Charlie Cai
        </h1>
        <p
          ref={promptRef}
          className="mt-6 font-mono text-[10px] tracking-[0.18em] text-zinc-500 uppercase opacity-0 transition-opacity duration-700 data-show:opacity-100 motion-reduce:hidden"
        >
          <span className="pointer-coarse:hidden">W fly · A/D yaw · hold W at limit → warp</span>
          <span className="hidden pointer-coarse:inline">Tap a beacon</span>
        </p>
      </div>

      {/* Flight HUD. Key caps are also pointer controls. */}
      <div
        ref={hudRef}
        data-hint=""
        data-mode="sub"
        aria-hidden="true"
        className="group/hud fixed right-6 bottom-6 z-20 hidden items-end gap-5 font-mono text-[10px] tracking-[0.18em] text-violet-200/55 uppercase select-none lg:flex motion-reduce:hidden"
      >
        <div className="flex flex-col items-end gap-1.5 tabular-nums">
          {/* FLIGHT */}
          <div className="flex flex-col items-end gap-0.5">
            <span
              data-f="badge"
              data-state="sub"
              className="font-cosmic text-[10px] font-bold tracking-[0.3em] text-violet-200/70 data-[state=arm]:text-violet-400 data-[state=limit]:text-amber-300 data-[state=warp]:text-violet-400"
            >
              Sublight
            </span>
            <span className="block h-px w-24 overflow-hidden bg-violet-200/10">
              <span
                data-f="armbar"
                className="block h-full w-full origin-left bg-violet-400"
                style={{ transform: "scaleX(0)" }}
              />
            </span>
          </div>
          {row("vel", "vel", "0.06 c")}
          <div className="h-px w-24 overflow-hidden bg-violet-200/15">
            <div
              data-f="velbar"
              className="h-full w-full origin-left bg-violet-300/70"
              style={{ transform: "scaleX(0.1)" }}
            />
          </div>
          <div className="hidden items-baseline gap-3 group-data-[mode=warp]/hud:flex">
            <span className="text-zinc-500">
              v<sub className="text-[8px]">s</sub>
            </span>
            <span data-f="vs" className="text-violet-100/80">
              —
            </span>
            <span className="text-violet-400">M</span>
          </div>
          <div className="hidden items-baseline gap-3 group-data-[mode=warp]/hud:flex">
            <span className="text-zinc-500">dst</span>
            <span data-f="dst" className="text-violet-100/80">
              —
            </span>
            <span className="text-violet-400">M</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-zinc-500">thr</span>
            <div className="h-px w-24 overflow-hidden bg-violet-200/15">
              <div
                data-f="thrbar"
                data-kind="fwd"
                className="h-full w-full origin-left bg-cyan-300/80 transition-transform duration-150 data-[kind=arm]:bg-violet-400 data-[kind=retro]:bg-amber-300/80"
                style={{ transform: "scaleX(0)" }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">rcs</span>
            <span
              data-f="rcs"
              className="h-1.5 w-1.5 rounded-full bg-violet-200/20 transition-colors duration-100 data-active:bg-amber-300 data-active:shadow-[0_0_6px_rgba(252,211,77,0.8)]"
            />
          </div>

          <span className="my-1 block h-px w-28 bg-violet-200/10" />

          {/* SKY */}
          {row("γ", "gamma", "1.00", "normal-case")}
          {row("gain", "gain", "×1.0")}
          <div className="flex items-baseline gap-3">
            <span className="text-zinc-500" data-f="doplabel">
              dop
            </span>
            <span data-f="dop" className="text-violet-100/80">
              ×1.06
            </span>
            <span className="hidden text-violet-400 group-data-[mode=warp]/hud:inline">M</span>
          </div>
          <div
            className="relative mb-0.5 h-[3px] w-24 rounded-sm opacity-60"
            style={{
              background:
                "linear-gradient(90deg, #ff3b1f 0%, #ffb000 25%, #d9ff5a 42%, #3fff8a 55%, #35c8ff 72%, #4d6bff 86%, #8a3dff 100%)",
            }}
          >
            <span
              data-f="spec"
              className="absolute -top-[3px] h-[9px] w-px bg-white transition-[left] duration-150"
              style={{ left: "50%" }}
            />
          </div>
          <div className="hidden items-baseline gap-3 group-data-[mode=warp]/hud:flex">
            <span className="text-zinc-500">clk</span>
            <span data-f="clk" className="text-violet-100/80">
              ×1
            </span>
            <span className="text-violet-400">M</span>
          </div>

          <span className="my-1 block h-px w-28 bg-violet-200/10" />

          {/* ATT */}
          {row("hdg", "hdg", "000°")}
          {row("yaw", "yaw", "+0.0°/s")}
          <div className="flex items-baseline gap-3">
            <span className="text-zinc-500">mkr</span>
            <span data-f="mkr" className="text-violet-100/80 data-model:text-violet-400">
              —
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="pointer-events-auto grid grid-cols-3 gap-1">
            <span />
            {cap("w")}
            <span />
            {cap("a")}
            {cap("s")}
            {cap("d")}
          </div>
          <span className="mt-1 text-[9px] tracking-[0.12em] text-zinc-500 normal-case">
            W·S thrust&ensp;A·D yaw
          </span>
        </div>
      </div>

      {/* Route fade. */}
      <div
        ref={fadeRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-40 bg-[#06060c] opacity-0 transition-opacity duration-300 data-on:opacity-100"
      />
    </>
  );
}
