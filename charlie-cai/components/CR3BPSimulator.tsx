"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Interactive simulator for the Planar Circular Restricted Three-Body Problem,
// in the co-rotating frame (normalized units: total mass = 1, primary
// separation = 1, angular frequency ω = 1). Mirrors the experiments in the
// paper: launch a satellite from any Lagrange point, vary the mass ratio and
// the initial perturbation, and toggle station-keeping (a continuous-thrust
// controller standing in for the paper's state-modification algorithm).

// ---- Physics (pure functions) ----------------------------------------------

type Vec4 = [number, number, number, number]; // [x, y, u, v]

interface KeepParams {
  lx: number;
  ly: number;
  kp: number;
  kd: number;
}

// Pseudo-potential Ω = ½(x²+y²) + (1−μ)/r1 + μ/r2
function omega(x: number, y: number, mu: number): number {
  const r1 = Math.hypot(x + mu, y);
  const r2 = Math.hypot(x - 1 + mu, y);
  return 0.5 * (x * x + y * y) + (1 - mu) / r1 + mu / r2;
}

// Equations of motion. With optional station-keeping (PD thrust to setpoint).
function deriv(s: Vec4, mu: number, keep: KeepParams | null): Vec4 {
  const [x, y, u, v] = s;
  const dx1 = x + mu;
  const dx2 = x - 1 + mu;
  const r1 = Math.hypot(dx1, y);
  const r2 = Math.hypot(dx2, y);
  const r1c = r1 * r1 * r1;
  const r2c = r2 * r2 * r2;
  // Gradient of the pseudo-potential
  const Ox = x - ((1 - mu) * dx1) / r1c - (mu * dx2) / r2c;
  const Oy = y - ((1 - mu) * y) / r1c - (mu * y) / r2c;
  let du = 2 * v + Ox; // includes Coriolis term
  let dv = -2 * u + Oy;
  if (keep) {
    du += keep.kp * (keep.lx - x) - keep.kd * u;
    dv += keep.kp * (keep.ly - y) - keep.kd * v;
  }
  return [u, v, du, dv];
}

function rk4(s: Vec4, dt: number, mu: number, keep: KeepParams | null): Vec4 {
  const k1 = deriv(s, mu, keep);
  const k2 = deriv(
    [s[0] + (dt / 2) * k1[0], s[1] + (dt / 2) * k1[1], s[2] + (dt / 2) * k1[2], s[3] + (dt / 2) * k1[3]],
    mu,
    keep
  );
  const k3 = deriv(
    [s[0] + (dt / 2) * k2[0], s[1] + (dt / 2) * k2[1], s[2] + (dt / 2) * k2[2], s[3] + (dt / 2) * k2[3]],
    mu,
    keep
  );
  const k4 = deriv(
    [s[0] + dt * k3[0], s[1] + dt * k3[1], s[2] + dt * k3[2], s[3] + dt * k3[3]],
    mu,
    keep
  );
  return [
    s[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    s[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    s[2] + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
    s[3] + (dt / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]),
  ];
}

type LP = { x: number; y: number };
type Lagrange = Record<"L1" | "L2" | "L3" | "L4" | "L5", LP>;

// Collinear points via Newton's method on dΩ/dx along y = 0.
function lagrangePoints(mu: number): Lagrange {
  const Ox = (x: number) => {
    const dx1 = x + mu;
    const dx2 = x - 1 + mu;
    const r1c = Math.abs(dx1) ** 3;
    const r2c = Math.abs(dx2) ** 3;
    return x - ((1 - mu) * dx1) / r1c - (mu * dx2) / r2c;
  };
  const solve = (guess: number) => {
    let x = guess;
    for (let i = 0; i < 80; i++) {
      const f = Ox(x);
      const h = 1e-6;
      const df = (Ox(x + h) - Ox(x - h)) / (2 * h);
      if (!isFinite(df) || df === 0) break;
      const nx = x - f / df;
      if (!isFinite(nx)) break;
      if (Math.abs(nx - x) < 1e-13) return nx;
      x = nx;
    }
    return x;
  };
  const c = Math.cbrt(mu / 3);
  return {
    L1: { x: solve(1 - mu - c), y: 0 },
    L2: { x: solve(1 - mu + c), y: 0 },
    L3: { x: solve(-(1 + (5 * mu) / 12)), y: 0 },
    L4: { x: 0.5 - mu, y: Math.sqrt(3) / 2 },
    L5: { x: 0.5 - mu, y: -Math.sqrt(3) / 2 },
  };
}

// L4/L5 are linearly stable above the Routh mass-ratio threshold (≈24.96),
// i.e. for μ below this critical value.
const MU_CRIT = 0.0385209;
const TU_DAYS = 57.5; // 1 normalized time unit ≈ 57.5 days (Sun–Earth)

// ---- Color ramp for the potential field ------------------------------------

const RAMP: [number, [number, number, number]][] = [
  [0.0, [8, 8, 18]],
  [0.45, [46, 16, 101]],
  [0.72, [124, 58, 237]],
  [0.88, [219, 39, 119]],
  [1.0, [245, 205, 255]],
];
function ramp(t: number): [number, number, number] {
  const tn = Math.max(0, Math.min(1, t));
  for (let i = 1; i < RAMP.length; i++) {
    if (tn <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1];
      const [t1, c1] = RAMP[i];
      const f = (tn - t0) / (t1 - t0);
      return [
        c0[0] + (c1[0] - c0[0]) * f,
        c0[1] + (c1[1] - c0[1]) * f,
        c0[2] + (c1[2] - c0[2]) * f,
      ];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

// ---- Graph tick helpers -----------------------------------------------------

function linTicks(min: number, max: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(min + ((max - min) * i) / n);
  return out;
}
function logTicks(min: number, max: number): number[] {
  const out: number[] = [];
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  for (let e = lo; e <= hi; e++) out.push(10 ** e);
  return out;
}
function fmt(v: number): string {
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 0.001 && a < 1000) return v.toFixed(a < 0.1 ? 3 : 2);
  return v.toExponential(0);
}

// ---- View bounds ------------------------------------------------------------

const VIEW = 1.55; // half-width of the square world shown

type LPName = "L1" | "L2" | "L3" | "L4" | "L5";

export default function CR3BPSimulator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Controls (UI state)
  const [mu, setMu] = useState(0.0121); // default ≈ Earth–Moon
  const [disturbX, setDisturbX] = useState(0.03);
  const [disturbV, setDisturbV] = useState(0.0);
  const [stationKeep, setStationKeep] = useState(false);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showField, setShowField] = useState(true);
  const [target, setTarget] = useState<LPName>("L4");
  const [logScale, setLogScale] = useState(false);

  // Live readouts
  const [readout, setReadout] = useState({ t: 0, drift: 0, status: "—" });

  // Mutable mirrors read by the animation loop (avoids stale closures)
  const stateRef = useRef<Vec4>([0, 0, 0, 0]);
  const simRef = useRef({ t: 0, escaped: false });
  const trailRef = useRef<number[][]>([]);
  const ctrl = useRef({ mu, disturbX, disturbV, stationKeep, running, speed, showField, target, logScale });
  const lpRef = useRef<Lagrange>(lagrangePoints(mu));
  const fieldRef = useRef<{ canvas: HTMLCanvasElement; mu: number } | null>(null);
  const driftHistRef = useRef<[number, number][]>([]);
  const initialDriftRef = useRef(0);
  const graphRef = useRef<HTMLCanvasElement>(null);

  // Keep the control mirror in sync on every render.
  ctrl.current = { mu, disturbX, disturbV, stationKeep, running, speed, showField, target, logScale };

  // Recompute Lagrange points whenever the mass ratio changes.
  useEffect(() => {
    lpRef.current = lagrangePoints(mu);
  }, [mu]);

  // Place the satellite at a Lagrange point + the chosen perturbation.
  const launch = useCallback(
    (lp: LPName) => {
      const lps = lagrangePoints(ctrl.current.mu);
      lpRef.current = lps;
      const p = lps[lp];
      stateRef.current = [
        p.x + ctrl.current.disturbX,
        p.y,
        ctrl.current.disturbV,
        0,
      ];
      simRef.current = { t: 0, escaped: false };
      trailRef.current = [];
      driftHistRef.current = [];
      initialDriftRef.current = 0;
      setTarget(lp);
      setRunning(true);
    },
    []
  );

  // Build the potential-field background for a given μ (offscreen, low-res).
  const buildField = useCallback((m: number) => {
    const N = 220;
    const off = document.createElement("canvas");
    off.width = N;
    off.height = N;
    const ictx = off.getContext("2d")!;
    const img = ictx.createImageData(N, N);
    const lo = 1.5;
    const hi = 2.7;
    for (let j = 0; j < N; j++) {
      const wy = VIEW - (j / (N - 1)) * 2 * VIEW;
      for (let i = 0; i < N; i++) {
        const wx = -VIEW + (i / (N - 1)) * 2 * VIEW;
        const val = omega(wx, wy, m);
        const tn = (Math.min(hi, Math.max(lo, val)) - lo) / (hi - lo);
        const [r, g, b] = ramp(tn);
        const k = (j * N + i) * 4;
        img.data[k] = r;
        img.data[k + 1] = g;
        img.data[k + 2] = b;
        img.data[k + 3] = 255;
      }
    }
    ictx.putImageData(img, 0, 0);
    fieldRef.current = { canvas: off, mu: m };
  }, []);

  // Main setup + animation loop (runs once).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.getContext("2d");
    if (!cx) return;
    const graph = graphRef.current;
    const gctx = graph ? graph.getContext("2d") : null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    let gW = 0;
    const gH = 190;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = rect.width;
      H = rect.width; // square
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.height = `${H}px`;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (graph && gctx) {
        gW = graph.getBoundingClientRect().width;
        graph.width = Math.floor(gW * dpr);
        graph.height = Math.floor(gH * dpr);
        graph.style.height = `${gH}px`;
        gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const toX = (wx: number) => ((wx + VIEW) / (2 * VIEW)) * W;
    const toY = (wy: number) => ((VIEW - wy) / (2 * VIEW)) * H;

    // Drift-vs-time chart (mirrors the paper's e-folding figures).
    const drawGraph = (
      g: CanvasRenderingContext2D,
      w: number,
      h: number,
      log: boolean
    ) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = "#0a0a12";
      g.fillRect(0, 0, w, h);
      const data = driftHistRef.current;
      const padL = 46;
      const padR = 14;
      const padT = 16;
      const padB = 22;
      const plotW = Math.max(10, w - padL - padR);
      const plotH = Math.max(10, h - padT - padB);
      g.font = "10px ui-sans-serif, system-ui";

      const tMax = Math.max(data.length ? data[data.length - 1][0] : 1, 1e-6);
      let yMax = 1e-6;
      let yMin = Infinity;
      for (let i = 0; i < data.length; i++) {
        const d = data[i][1];
        if (d > yMax) yMax = d;
        if (d > 0 && d < yMin) yMin = d;
      }
      if (!isFinite(yMin)) yMin = 1e-4;
      const yBot = log ? Math.max(yMin * 0.5, 1e-5) : 0;
      const yTop = (log ? yMax * 1.8 : yMax * 1.15) || 1;

      const X = (t: number) => padL + (t / tMax) * plotW;
      const Y = (d: number) => {
        if (log) {
          const lo = Math.log10(yBot);
          const hi = Math.log10(yTop);
          const v = Math.log10(Math.max(d, yBot));
          return padT + plotH - ((v - lo) / (hi - lo)) * plotH;
        }
        return padT + plotH - ((d - yBot) / (yTop - yBot)) * plotH;
      };

      // gridlines + y labels
      const ticks = log ? logTicks(yBot, yTop) : linTicks(yBot, yTop, 4);
      for (const tk of ticks) {
        const yy = Y(tk);
        if (yy < padT - 1 || yy > padT + plotH + 1) continue;
        g.strokeStyle = "rgba(255,255,255,0.06)";
        g.beginPath();
        g.moveTo(padL, yy);
        g.lineTo(padL + plotW, yy);
        g.stroke();
        g.fillStyle = "rgba(255,255,255,0.4)";
        g.fillText(fmt(tk), 4, yy + 3);
      }

      // axes
      g.strokeStyle = "rgba(255,255,255,0.18)";
      g.beginPath();
      g.moveTo(padL, padT);
      g.lineTo(padL, padT + plotH);
      g.lineTo(padL + plotW, padT + plotH);
      g.stroke();
      g.fillStyle = "rgba(255,255,255,0.4)";
      g.fillText("0", padL - 2, padT + plotH + 13);
      g.fillText(`${tMax.toFixed(1)} TU`, padL + plotW - 34, padT + plotH + 13);

      // e-folding reference lines from the initial drift
      const init = initialDriftRef.current;
      if (init > 0) {
        const labels = ["e×", "e²×", "e³×"];
        for (let n = 1; n <= 3; n++) {
          const lvl = init * Math.exp(n);
          if (lvl <= yTop && lvl >= yBot) {
            const yy = Y(lvl);
            g.strokeStyle = "rgba(251,191,36,0.35)";
            g.setLineDash([4, 3]);
            g.beginPath();
            g.moveTo(padL, yy);
            g.lineTo(padL + plotW, yy);
            g.stroke();
            g.setLineDash([]);
            g.fillStyle = "rgba(251,191,36,0.75)";
            g.fillText(labels[n - 1], padL + plotW - 18, yy - 2);
          }
        }
      }

      // the curve
      if (data.length > 1) {
        g.strokeStyle = "#a78bfa";
        g.lineWidth = 1.5;
        g.beginPath();
        for (let i = 0; i < data.length; i++) {
          const xx = X(data[i][0]);
          const yy = Y(data[i][1]);
          if (i === 0) g.moveTo(xx, yy);
          else g.lineTo(xx, yy);
        }
        g.stroke();
      } else {
        g.fillStyle = "rgba(255,255,255,0.3)";
        g.fillText("Launch a satellite to plot its drift…", padL + 6, padT + plotH / 2);
      }

      g.fillStyle = "rgba(255,255,255,0.55)";
      g.fillText(
        `Drift from ${ctrl.current.target} vs. time${log ? " — log scale" : ""}`,
        padL,
        11
      );
    };

    // Launch the default scenario.
    launch("L4");

    let raf = 0;
    let frameCount = 0;

    const frame = () => {
      const c = ctrl.current;

      // Rebuild the field background if μ changed (or first run).
      if (c.showField && (!fieldRef.current || fieldRef.current.mu !== c.mu)) {
        buildField(c.mu);
      }

      // Integrate.
      if (c.running && !simRef.current.escaped) {
        const dt = 0.005;
        const steps = Math.max(1, Math.round(6 * c.speed));
        const keep: KeepParams | null = c.stationKeep
          ? { lx: lpRef.current[c.target].x, ly: lpRef.current[c.target].y, kp: 6, kd: 4 }
          : null;
        for (let i = 0; i < steps; i++) {
          stateRef.current = rk4(stateRef.current, dt, c.mu, keep);
          simRef.current.t += dt;
          const s = stateRef.current;
          trailRef.current.push([s[0], s[1]]);
          if (trailRef.current.length > 2200) trailRef.current.shift();
          // Escape check (left the view).
          if (Math.abs(s[0]) > VIEW || Math.abs(s[1]) > VIEW) {
            simRef.current.escaped = true;
            break;
          }
        }
      }

      // Record drift history for the graph (once per frame while running).
      {
        const sNow = stateRef.current;
        const tgtNow = lpRef.current[c.target];
        const driftNow = Math.hypot(sNow[0] - tgtNow.x, sNow[1] - tgtNow.y);
        if (c.running && !simRef.current.escaped) {
          const hist = driftHistRef.current;
          if (hist.length === 0) initialDriftRef.current = Math.max(driftNow, 1e-4);
          hist.push([simRef.current.t, driftNow]);
          if (hist.length > 2000) {
            const dec: [number, number][] = [];
            for (let i = 0; i < hist.length; i += 2) dec.push(hist[i]);
            driftHistRef.current = dec;
          }
        }
      }

      // ---- Draw ----
      cx.clearRect(0, 0, W, H);
      cx.fillStyle = "#06060c";
      cx.fillRect(0, 0, W, H);

      if (c.showField && fieldRef.current) {
        cx.globalAlpha = 0.85;
        cx.imageSmoothingEnabled = true;
        cx.drawImage(fieldRef.current.canvas, 0, 0, W, H);
        cx.globalAlpha = 1;
      }

      const lps = lpRef.current;
      const stableL45 = c.mu <= MU_CRIT;

      // Lagrange points
      const lpEntries: [LPName, LP][] = [
        ["L1", lps.L1],
        ["L2", lps.L2],
        ["L3", lps.L3],
        ["L4", lps.L4],
        ["L5", lps.L5],
      ];
      for (const [name, p] of lpEntries) {
        const stable = name === "L4" || name === "L5" ? stableL45 : false;
        const px = toX(p.x);
        const py = toY(p.y);
        cx.beginPath();
        cx.arc(px, py, name === c.target ? 5 : 3.5, 0, Math.PI * 2);
        cx.fillStyle = stable ? "#34d399" : "#fbbf24";
        cx.fill();
        if (name === c.target) {
          cx.beginPath();
          cx.arc(px, py, 9, 0, Math.PI * 2);
          cx.strokeStyle = "rgba(255,255,255,0.5)";
          cx.lineWidth = 1;
          cx.stroke();
        }
        cx.fillStyle = "rgba(255,255,255,0.85)";
        cx.font = "11px ui-sans-serif, system-ui";
        cx.fillText(name, px + 7, py - 6);
      }

      // Primaries
      const p1x = toX(-c.mu);
      const p1y = toY(0);
      const p2x = toX(1 - c.mu);
      const p2y = toY(0);
      // larger primary
      const g1 = cx.createRadialGradient(p1x, p1y, 0, p1x, p1y, 16);
      g1.addColorStop(0, "#fff7e6");
      g1.addColorStop(1, "rgba(255,200,80,0)");
      cx.fillStyle = g1;
      cx.beginPath();
      cx.arc(p1x, p1y, 16, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = "#ffd27a";
      cx.beginPath();
      cx.arc(p1x, p1y, 6, 0, Math.PI * 2);
      cx.fill();
      // smaller primary
      cx.fillStyle = "#7dd3fc";
      cx.beginPath();
      cx.arc(p2x, p2y, 4, 0, Math.PI * 2);
      cx.fill();

      // Satellite trail
      const trail = trailRef.current;
      if (trail.length > 1) {
        cx.lineWidth = 1.5;
        cx.beginPath();
        for (let i = 0; i < trail.length; i++) {
          const px = toX(trail[i][0]);
          const py = toY(trail[i][1]);
          if (i === 0) cx.moveTo(px, py);
          else cx.lineTo(px, py);
        }
        cx.strokeStyle = "rgba(167,139,250,0.55)";
        cx.stroke();
      }

      // Satellite
      const s = stateRef.current;
      const sx = toX(s[0]);
      const sy = toY(s[1]);
      const gs = cx.createRadialGradient(sx, sy, 0, sx, sy, 8);
      gs.addColorStop(0, "#ffffff");
      gs.addColorStop(1, "rgba(167,139,250,0)");
      cx.fillStyle = gs;
      cx.beginPath();
      cx.arc(sx, sy, 8, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = "#ffffff";
      cx.beginPath();
      cx.arc(sx, sy, 2.5, 0, Math.PI * 2);
      cx.fill();

      // Drift-vs-time graph.
      if (graph && gctx) drawGraph(gctx, gW, gH, c.logScale);

      // Update readouts ~8x/sec
      frameCount++;
      if (frameCount % 8 === 0) {
        const tgt = lpRef.current[c.target];
        const drift = Math.hypot(s[0] - tgt.x, s[1] - tgt.y);
        const status = simRef.current.escaped
          ? "escaped"
          : drift > 0.2
            ? "drifting"
            : "in orbit";
        setReadout({ t: simRef.current.t, drift, status });
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildField, launch]);

  const massRatio = (1 - mu) / mu;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      {/* Canvas */}
      <div>
        <canvas
          ref={canvasRef}
          className="w-full rounded-xl border border-zinc-800 bg-[#06060c]"
        />
        <div className="mt-3 grid grid-cols-3 gap-3 text-center text-sm">
          <Stat label="Time" value={`${readout.t.toFixed(1)} TU`} sub={`${(readout.t * TU_DAYS).toFixed(0)} days`} />
          <Stat label="Drift from point" value={readout.drift.toFixed(4)} sub="normalized" />
          <Stat
            label="Status"
            value={readout.status}
            sub={readout.status === "escaped" ? "left the system" : " "}
            highlight={readout.status === "escaped"}
          />
        </div>

        {/* Drift vs. time graph */}
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Drift vs. time
            </span>
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={logScale}
                onChange={(e) => setLogScale(e.target.checked)}
                className="h-3.5 w-3.5 accent-violet-500"
              />
              log scale
            </label>
          </div>
          <canvas
            ref={graphRef}
            className="w-full rounded-xl border border-zinc-800 bg-[#0a0a12]"
          />
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-6 text-sm">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Launch from
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {(["L1", "L2", "L3", "L4", "L5"] as LPName[]).map((name) => (
              <button
                key={name}
                onClick={() => launch(name)}
                className={`rounded-md border py-1.5 font-medium transition-colors ${
                  target === name
                    ? "border-violet-500 bg-violet-500/20 text-violet-200"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <Slider
          label="Mass parameter μ"
          value={mu}
          min={0.001}
          max={0.5}
          step={0.001}
          onChange={setMu}
          readout={`ratio ${massRatio < 1000 ? massRatio.toFixed(1) : massRatio.toExponential(1)} : 1`}
        />
        <p className="-mt-3 text-xs text-zinc-500">
          L4 / L5 are {mu <= MU_CRIT ? (
            <span className="text-emerald-400">stable</span>
          ) : (
            <span className="text-amber-400">unstable</span>
          )}{" "}
          (stable when ratio ≥ 24.96, i.e. μ ≤ 0.0385).
        </p>

        <Slider
          label="Initial displacement δx"
          value={disturbX}
          min={0}
          max={0.08}
          step={0.001}
          onChange={setDisturbX}
          readout={disturbX.toFixed(3)}
        />
        <Slider
          label="Initial velocity δv"
          value={disturbV}
          min={0}
          max={0.08}
          step={0.001}
          onChange={setDisturbV}
          readout={disturbV.toFixed(3)}
        />

        <label className="flex items-center justify-between">
          <span className="text-zinc-300">Station-keeping</span>
          <input
            type="checkbox"
            checked={stationKeep}
            onChange={(e) => setStationKeep(e.target.checked)}
            className="h-4 w-4 accent-violet-500"
          />
        </label>

        <Slider
          label="Speed"
          value={speed}
          min={0.25}
          max={3}
          step={0.25}
          onChange={setSpeed}
          readout={`${speed.toFixed(2)}×`}
        />

        <label className="flex items-center justify-between">
          <span className="text-zinc-300">Show potential field</span>
          <input
            type="checkbox"
            checked={showField}
            onChange={(e) => setShowField(e.target.checked)}
            className="h-4 w-4 accent-violet-500"
          />
        </label>

        <div className="flex gap-2">
          <button
            onClick={() => setRunning((r) => !r)}
            className="flex-1 rounded-md border border-zinc-700 py-2 font-medium text-zinc-200 hover:border-zinc-500"
          >
            {running ? "Pause" : "Play"}
          </button>
          <button
            onClick={() => launch(target)}
            className="flex-1 rounded-md border border-violet-500 bg-violet-500/15 py-2 font-medium text-violet-200 hover:bg-violet-500/25"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-2 py-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div
        className={`font-display text-base font-semibold ${
          highlight ? "text-amber-400" : "text-zinc-100"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-zinc-600">{sub}</div>}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  readout,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  readout: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-zinc-300">{label}</span>
        <span className="text-xs text-zinc-500">{readout}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-violet-500"
      />
    </div>
  );
}
