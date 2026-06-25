"use client";

import { useEffect, useRef, useState } from "react";

// Interactive "pancake rotation" (IYPT Q15 / swirled granular media).
// Discs in a circular container whose centre is swirled (translated around a
// small circle without spinning). No floor friction; interaction is purely
// collisional: elastic in the normal direction, Coulomb-friction tangential
// impulse with a stick clamp (Wang–Mason). The swarm acquires a net rotation
// about its centre of mass — co-rotating with the swirl when loose, flipping to
// counter-rotation once it jams. Every number shown is computed live from this
// engine; nothing is fit to external data.

const DT = 0.004;
const VCAP = 60; // safety clamp so frictionless runs can't blow up
const RAD2DEG = 180 / Math.PI;

interface Params {
  N: number;
  swirlDeg: number; // swirl rate ω in deg/s
  m: number;
  A: number; // swirl amplitude
  rball: number;
  Rcont: number;
  muBB: number;
  muBC: number;
}

type Var = keyof Omit<Params, never>;

const VLABEL: Record<Var, string> = {
  N: "number of discs N",
  swirlDeg: "swirl rate ω (°/s)",
  m: "ball mass m",
  A: "swirl amplitude A",
  rball: "ball radius r",
  Rcont: "container radius R",
  muBC: "wall friction μ",
  muBB: "ball friction μ",
};

const Iof = (p: Params) => 0.5 * p.m * p.rball * p.rball;

interface SimState {
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  w: Float64Array;
  phi: Float64Array;
  n: number;
  cx: number;
  cy: number;
  uCx: number;
  uCy: number;
  t: number;
}

function packPts(p: Params): [number, number, number][] {
  const sx = 2 * p.rball * 1.02;
  const sy = p.rball * 1.02 * Math.sqrt(3);
  const lim = (p.Rcont - p.rball) ** 2;
  const rng = Math.ceil(p.Rcont / p.rball) + 3;
  const pts: [number, number, number][] = [];
  for (let b = -rng; b <= rng; b++)
    for (let a = -rng; a <= rng; a++) {
      const px = p.A + sx * (a + 0.5 * (b & 1));
      const py = sy * b;
      const r2 = (px - p.A) ** 2 + py * py;
      if (r2 <= lim) pts.push([px, py, r2]);
    }
  pts.sort((u, v) => u[2] - v[2]);
  return pts;
}
const packCount = (p: Params) => packPts(p).length;

function makeState(p: Params): SimState {
  const pts = packPts(p);
  const n = Math.min(Math.round(p.N), pts.length);
  const s: SimState = {
    x: new Float64Array(n),
    y: new Float64Array(n),
    vx: new Float64Array(n),
    vy: new Float64Array(n),
    w: new Float64Array(n),
    phi: new Float64Array(n),
    n,
    cx: p.A,
    cy: 0,
    uCx: 0,
    uCy: 0,
    t: 0,
  };
  for (let i = 0; i < n; i++) {
    s.x[i] = pts[i][0] + (Math.random() - 0.5) * 0.04;
    s.y[i] = pts[i][1] + (Math.random() - 0.5) * 0.04;
  }
  return s;
}

function step(s: SimState, p: Params) {
  const I = Iof(p);
  const om = (p.swirlDeg * Math.PI) / 180;
  const { m, A, rball, Rcont, muBB, muBC } = p;
  s.t += DT;
  const th = om * s.t;
  s.cx = A * Math.cos(th);
  s.cy = A * Math.sin(th);
  s.uCx = -A * om * Math.sin(th);
  s.uCy = A * om * Math.cos(th);

  const { x, y, vx, vy, w, phi, n } = s;
  for (let i = 0; i < n; i++) {
    x[i] += vx[i] * DT;
    y[i] += vy[i] * DT;
    phi[i] += w[i] * DT;
  }

  const d0 = 2 * rball;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[j] - x[i];
      const dy = y[j] - y[i];
      const d2 = dx * dx + dy * dy;
      if (d2 >= d0 * d0 || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const tx = ny;
      const ty = -nx;
      const vin = vx[i] * nx + vy[i] * ny;
      const vit = vx[i] * tx + vy[i] * ty;
      const vjn = vx[j] * nx + vy[j] * ny;
      const vjt = vx[j] * tx + vy[j] * ty;
      if (vin - vjn > 0) {
        const Jn = m * (vin - vjn);
        const vrel = vjt - vit + rball * (w[i] + w[j]);
        const s0 = Math.sign(vrel);
        const Jf =
          -s0 *
          Math.min(muBB * Math.abs(Jn), Math.abs(vrel) / (2 / m + (2 * rball * rball) / I));
        const nvit = vit - Jf / m;
        const nvjt = vjt + Jf / m;
        w[i] += (rball * Jf) / I;
        w[j] += (rball * Jf) / I;
        vx[i] = vjn * nx + nvit * tx;
        vy[i] = vjn * ny + nvit * ty;
        vx[j] = vin * nx + nvjt * tx;
        vy[j] = vin * ny + nvjt * ty;
      }
      const ov = d0 - d;
      x[i] -= 0.5 * ov * nx;
      y[i] -= 0.5 * ov * ny;
      x[j] += 0.5 * ov * nx;
      y[j] += 0.5 * ov * ny;
    }
  }

  const lim = Rcont - rball;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - s.cx;
    const dy = y[i] - s.cy;
    const d2 = dx * dx + dy * dy;
    if (d2 <= lim * lim) continue;
    const d = Math.sqrt(d2);
    const nx = -dx / d;
    const ny = -dy / d;
    const tx = ny;
    const ty = -nx;
    const vin = vx[i] * nx + vy[i] * ny;
    const vit = vx[i] * tx + vy[i] * ty;
    const uCn = s.uCx * nx + s.uCy * ny;
    const uCt = s.uCx * tx + s.uCy * ty;
    if (vin - uCn < 0) {
      const Jn = 2 * m * (uCn - vin);
      const vrel = vit - uCt + rball * w[i];
      const s0 = Math.sign(vrel);
      const Jf =
        -s0 * Math.min(muBC * Math.abs(Jn), Math.abs(vrel) / (1 / m + (rball * rball) / I));
      const nvin = 2 * uCn - vin;
      const nvit = vit + Jf / m;
      w[i] += (rball * Jf) / I;
      vx[i] = nvin * nx + nvit * tx;
      vy[i] = nvin * ny + nvit * ty;
    }
    x[i] = s.cx + (dx / d) * lim;
    y[i] = s.cy + (dy / d) * lim;
  }

  // safety clamp
  for (let i = 0; i < n; i++) {
    const sp = Math.hypot(vx[i], vy[i]);
    if (sp > VCAP) {
      vx[i] *= VCAP / sp;
      vy[i] *= VCAP / sp;
    }
    if (w[i] > 300) w[i] = 300;
    else if (w[i] < -300) w[i] = -300;
  }
}

function omegaCOM(s: SimState): number {
  const { x, y, vx, vy, n } = s;
  if (n === 0) return 0;
  let xC = 0,
    yC = 0,
    vxC = 0,
    vyC = 0;
  for (let i = 0; i < n; i++) {
    xC += x[i];
    yC += y[i];
    vxC += vx[i];
    vyC += vy[i];
  }
  xC /= n;
  yC /= n;
  vxC /= n;
  vyC /= n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const rx = x[i] - xC;
    const ry = y[i] - yC;
    const r2 = rx * rx + ry * ry + 1e-9;
    sum += (rx * (vy[i] - vyC) - ry * (vx[i] - vxC)) / r2;
  }
  return sum / n;
}

function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}
function sweepValues(V: Var, base: Params): number[] {
  switch (V) {
    case "N": {
      const hi = Math.min(64, packCount(base));
      const out: number[] = [];
      for (let v = 6; v <= hi; v += Math.max(2, Math.round((hi - 6) / 13))) out.push(v);
      return out;
    }
    case "swirlDeg":
      return linspace(20, 110, 10);
    case "m":
      return linspace(0.3, 2.5, 9);
    case "A":
      return linspace(0.8, Math.min(3.4, base.Rcont - base.rball - 0.6), 9);
    case "rball":
      return linspace(0.7, 1.5, 9);
    case "Rcont":
      return linspace(6, 11, 9);
    case "muBC":
      return linspace(0.1, 1.4, 10);
    case "muBB":
      return linspace(0.0, 1.4, 10);
  }
}

// Interpolate the N where Ω crosses zero (co → counter).
function crossingN(data: [number, number][]): number {
  for (let i = 0; i < data.length - 1; i++) {
    const [n0, o0] = data[i];
    const [n1, o1] = data[i + 1];
    if (o0 >= 0 && o1 < 0) return n0 + ((0 - o0) / (o1 - o0)) * (n1 - n0);
  }
  return NaN;
}

type Dep = "omega" | "ncrit";

interface Sweep {
  active: boolean;
  dep: Dep;
  V: Var;
  values: number[];
  vi: number;
  results: [number, number][];
  base: Params;
  p: Params;
  st: SimState;
  phase: "eq" | "meas";
  steps: number;
  eqSteps: number;
  measSteps: number;
  acc: number;
  cnt: number;
  inner: { Ns: number[]; ni: number; data: [number, number][] } | null;
}

export default function PancakeSimulator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<HTMLCanvasElement>(null);

  const [P, setP] = useState<Params>({
    N: 18,
    swirlDeg: 30,
    m: 1,
    A: 1.9,
    rball: 1.0,
    Rcont: 8.6,
    muBB: 1.0,
    muBC: 1.0,
  });
  const [frame, setFrame] = useState<"container" | "lab">("container");
  const [speed, setSpeed] = useState(3);
  const [running, setRunning] = useState(true);
  const [omega, setOmega] = useState(0);
  const [dep, setDep] = useState<Dep>("omega");
  const [indep, setIndep] = useState<Var>("N");
  const [sweeping, setSweeping] = useState(false);
  const [progress, setProgress] = useState(0);

  const ctrl = useRef({ P, frame, speed, running });
  ctrl.current = { P, frame, speed, running };

  const simRef = useRef<SimState | null>(null);
  const omEMA = useRef(0);
  const resetFlag = useRef(true);
  const sweepRef = useRef<Sweep | null>(null);

  const setParam = (k: Var, v: number, reinit: boolean) => {
    setP((prev) => ({ ...prev, [k]: v }));
    if (reinit) resetFlag.current = true;
  };

  const beginRun = (sw: Sweep) => {
    sw.st = makeState(sw.p);
    sw.phase = "eq";
    sw.steps = 0;
    sw.acc = 0;
    sw.cnt = 0;
  };
  const startSweep = () => {
    const base = ctrl.current.P;
    const V = indep;
    const values = sweepValues(V, base);
    const sw: Sweep = {
      active: true,
      dep,
      V,
      values,
      vi: 0,
      results: [],
      base,
      p: { ...base },
      st: makeState(base),
      phase: "eq",
      steps: 0,
      eqSteps: Math.round((dep === "omega" ? 20 : 12) / DT),
      measSteps: Math.round((dep === "omega" ? 12 : 7) / DT),
      acc: 0,
      cnt: 0,
      inner: null,
    };
    const setupValue = () => {
      const val = sw.values[sw.vi];
      if (sw.dep === "omega") {
        sw.p = { ...sw.base, [sw.V]: val };
        beginRun(sw);
      } else {
        const pv = { ...sw.base, [sw.V]: val };
        const hi = Math.min(64, packCount(pv));
        const Ns: number[] = [];
        for (let v = 6; v <= hi; v += Math.max(3, Math.round((hi - 6) / 8))) Ns.push(v);
        sw.inner = { Ns, ni: 0, data: [] };
        sw.p = { ...pv, N: Ns[0] };
        beginRun(sw);
      }
    };
    sweepRef.current = sw;
    // attach setup to ref via closure: store on object
    (sw as Sweep & { setupValue: () => void }).setupValue = setupValue;
    setupValue();
    setSweeping(true);
    setProgress(0);
  };
  const stopSweep = () => {
    if (sweepRef.current) sweepRef.current.active = false;
    sweepRef.current = null;
    setSweeping(false);
    resetFlag.current = true;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const graph = graphRef.current;
    if (!canvas) return;
    const cx = canvas.getContext("2d");
    const gctx = graph ? graph.getContext("2d") : null;
    if (!cx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let W = 0;
    let gW = 0;
    const gH = 190;
    const resize = () => {
      W = canvas.getBoundingClientRect().width;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(W * dpr);
      canvas.style.height = `${W}px`;
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

    simRef.current = makeState(ctrl.current.P);
    resetFlag.current = false;

    const drawSim = (s: SimState, p: Params, fr: "container" | "lab") => {
      cx.clearRect(0, 0, W, W);
      cx.fillStyle = "#0a0a12";
      cx.fillRect(0, 0, W, W);
      const span = fr === "container" ? p.Rcont : p.A + p.Rcont;
      const scale = (W * 0.46) / span;
      const ox = fr === "container" ? s.cx : 0;
      const oy = fr === "container" ? s.cy : 0;
      const SX = (wx: number) => W / 2 + (wx - ox) * scale;
      const SY = (wy: number) => W / 2 - (wy - oy) * scale;

      cx.beginPath();
      cx.arc(SX(s.cx), SY(s.cy), p.Rcont * scale, 0, Math.PI * 2);
      cx.strokeStyle = "rgba(255,255,255,0.35)";
      cx.lineWidth = 2;
      cx.stroke();

      if (fr === "lab") {
        cx.beginPath();
        cx.arc(SX(0), SY(0), p.A * scale, 0, Math.PI * 2);
        cx.strokeStyle = "rgba(167,139,250,0.25)";
        cx.lineWidth = 1;
        cx.stroke();
      }

      const rball = p.rball * scale;
      for (let i = 0; i < s.n; i++) {
        const px = SX(s.x[i]);
        const py = SY(s.y[i]);
        cx.beginPath();
        cx.arc(px, py, rball, 0, Math.PI * 2);
        cx.fillStyle = "#a78bfa";
        cx.fill();
        cx.beginPath();
        cx.moveTo(px, py);
        cx.lineTo(px + Math.cos(s.phi[i]) * rball * 0.85, py - Math.sin(s.phi[i]) * rball * 0.85);
        cx.strokeStyle = "rgba(10,10,18,0.8)";
        cx.lineWidth = Math.max(1, rball * 0.18);
        cx.stroke();
      }

      if (s.n > 0) {
        let mx = 0;
        let my = 0;
        for (let i = 0; i < s.n; i++) {
          mx += s.x[i];
          my += s.y[i];
        }
        mx /= s.n;
        my /= s.n;
        cx.beginPath();
        cx.arc(SX(mx), SY(my), 5, 0, Math.PI * 2);
        cx.fillStyle = "#ffffff";
        cx.fill();
        cx.lineWidth = 1.5;
        cx.strokeStyle = "rgba(10,10,18,0.9)";
        cx.stroke();
      }

      const csx = SX(s.cx);
      const csy = SY(s.cy);
      const sp = Math.hypot(s.uCx, s.uCy) || 1;
      const ax = (s.uCx / sp) * 26;
      const ay = -(s.uCy / sp) * 26;
      cx.beginPath();
      cx.moveTo(csx, csy);
      cx.lineTo(csx + ax, csy + ay);
      cx.strokeStyle = "rgba(251,191,36,0.9)";
      cx.lineWidth = 2;
      cx.stroke();
    };

    const drawGraph = (g: CanvasRenderingContext2D, w: number, h: number, sw: Sweep | null) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = "#0a0a12";
      g.fillRect(0, 0, w, h);
      const padL = 46;
      const padR = 12;
      const padT = 16;
      const padB = 24;
      const pw = Math.max(10, w - padL - padR);
      const ph = Math.max(10, h - padT - padB);
      g.font = "10px ui-sans-serif, system-ui";

      if (!sw) {
        g.fillStyle = "rgba(255,255,255,0.3)";
        g.fillText("Pick variables below and press Plot…", padL + 6, padT + ph / 2);
        return;
      }
      const isOmega = sw.dep === "omega";
      const xs = sw.values;
      const xmin = xs[0];
      const xmax = xs[xs.length - 1];
      const pts = sw.results;
      let yhi: number;
      let ylo: number;
      if (isOmega) {
        yhi = 0;
        for (const [, o] of pts) yhi = Math.max(yhi, Math.abs(o));
        yhi = Math.max(yhi * 1.15, 10);
        ylo = -yhi;
      } else {
        yhi = 0;
        for (const [, o] of pts) if (isFinite(o)) yhi = Math.max(yhi, o);
        yhi = Math.max(yhi * 1.15, 20);
        ylo = 0;
      }
      const X = (v: number) => padL + ((v - xmin) / (xmax - xmin || 1)) * pw;
      const Y = (v: number) => padT + ph - ((v - ylo) / (yhi - ylo || 1)) * ph;

      // zero line for omega
      if (isOmega) {
        const y0 = Y(0);
        g.strokeStyle = "rgba(255,255,255,0.25)";
        g.beginPath();
        g.moveTo(padL, y0);
        g.lineTo(padL + pw, y0);
        g.stroke();
        g.fillStyle = "rgba(52,211,153,0.7)";
        g.fillText("co", padL + 3, Y(yhi * 0.7));
        g.fillStyle = "rgba(251,146,60,0.8)";
        g.fillText("counter", padL + 3, Y(-yhi * 0.7));
      }
      // axes
      g.strokeStyle = "rgba(255,255,255,0.18)";
      g.beginPath();
      g.moveTo(padL, padT);
      g.lineTo(padL, padT + ph);
      g.lineTo(padL + pw, padT + ph);
      g.stroke();
      g.fillStyle = "rgba(255,255,255,0.4)";
      g.fillText(xmin.toFixed(xmin < 10 ? 1 : 0), padL - 2, padT + ph + 13);
      g.fillText(xmax.toFixed(xmax < 10 ? 1 : 0), padL + pw - 16, padT + ph + 13);
      g.fillText(yhi.toFixed(0), 8, Y(yhi) + 3);
      g.fillText(ylo.toFixed(0), 18, Y(ylo) + 3);
      g.fillStyle = "rgba(255,255,255,0.55)";
      const yl = isOmega ? "Ω (°/s)" : "N critical";
      g.fillText(`${yl} vs ${VLABEL[sw.V]}`, padL, 11);

      if (pts.length > 0) {
        const clean = pts.filter((q) => isFinite(q[1]));
        g.strokeStyle = "#a78bfa";
        g.lineWidth = 1.5;
        g.beginPath();
        clean.forEach(([vx0, o], i) => (i ? g.lineTo(X(vx0), Y(o)) : g.moveTo(X(vx0), Y(o))));
        g.stroke();
        for (const [vx0, o] of clean) {
          g.fillStyle = isOmega ? (o >= 0 ? "#34d399" : "#fb923c") : "#a78bfa";
          g.beginPath();
          g.arc(X(vx0), Y(o), 2.4, 0, Math.PI * 2);
          g.fill();
        }
      }
    };

    let raf = 0;
    let frames = 0;
    const frame = () => {
      const c = ctrl.current;
      const sw = sweepRef.current;

      if (sw && sw.active) {
        const chunk = 480;
        for (let k = 0; k < chunk; k++) {
          step(sw.st, sw.p);
          sw.steps++;
          if (sw.phase === "eq") {
            if (sw.steps >= sw.eqSteps) {
              sw.phase = "meas";
              sw.steps = 0;
              sw.acc = 0;
              sw.cnt = 0;
            }
          } else {
            sw.acc += omegaCOM(sw.st);
            sw.cnt++;
            if (sw.steps >= sw.measSteps) {
              const om = (sw.acc / sw.cnt) * RAD2DEG;
              const setup = (sw as Sweep & { setupValue: () => void }).setupValue;
              if (sw.dep === "omega") {
                sw.results.push([sw.values[sw.vi], om]);
                sw.vi++;
                if (sw.vi >= sw.values.length) {
                  sw.active = false;
                  setSweeping(false);
                } else setup();
              } else {
                const inner = sw.inner!;
                inner.data.push([sw.st.n, om]);
                inner.ni++;
                if (inner.ni < inner.Ns.length) {
                  sw.p = { ...sw.p, N: inner.Ns[inner.ni] };
                  beginRun(sw);
                } else {
                  sw.results.push([sw.values[sw.vi], crossingN(inner.data)]);
                  sw.vi++;
                  if (sw.vi >= sw.values.length) {
                    sw.active = false;
                    setSweeping(false);
                  } else setup();
                }
              }
              break;
            }
          }
        }
        drawSim(sw.st, sw.p, c.frame);
        if (graph && gctx) drawGraph(gctx, gW, gH, sw);
        frames++;
        if (frames % 6 === 0) {
          const inFrac = sw.inner ? sw.inner.ni / Math.max(1, sw.inner.Ns.length) : 0;
          setProgress(Math.min(100, ((sw.vi + inFrac) / sw.values.length) * 100));
        }
        raf = requestAnimationFrame(frame);
        return;
      }

      // live mode
      if (resetFlag.current) {
        simRef.current = makeState(c.P);
        omEMA.current = 0;
        resetFlag.current = false;
      }
      const s = simRef.current!;
      if (c.running) {
        const steps = Math.max(1, Math.round(2 * c.speed));
        for (let k = 0; k < steps; k++) step(s, c.P);
        omEMA.current = omEMA.current * 0.97 + omegaCOM(s) * 0.03;
      }
      drawSim(s, c.P, c.frame);
      if (graph && gctx) drawGraph(gctx, gW, gH, sweepRef.current);
      frames++;
      if (frames % 8 === 0) setOmega(omEMA.current * RAD2DEG);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const co = omega >= 0;
  const indepOptions: Var[] = (
    ["N", "swirlDeg", "m", "A", "rball", "Rcont", "muBC", "muBB"] as Var[]
  ).filter((v) => !(dep === "ncrit" && v === "N"));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div>
        <canvas ref={canvasRef} className="w-full rounded-xl border border-zinc-800 bg-[#0a0a12]" />
        <div className="mt-3 grid grid-cols-2 gap-3 text-center text-sm">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-2 py-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Swarm rotation Ω</div>
            <div className={`font-display text-base font-semibold ${co ? "text-emerald-400" : "text-orange-400"}`}>
              {omega.toFixed(1)} °/s · {co ? "co" : "counter"}
            </div>
            <div className="text-[10px] text-zinc-600">swirl +{P.swirlDeg.toFixed(0)} °/s (↺)</div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-2 py-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Discs packed</div>
            <div className="font-display text-base font-semibold text-zinc-100">
              {simRef.current?.n ?? P.N}
            </div>
            <div className="text-[10px] text-zinc-600">white dot = centre of mass</div>
          </div>
        </div>
        <canvas ref={graphRef} className="mt-4 w-full rounded-xl border border-zinc-800 bg-[#0a0a12]" />

        {/* Plot tool */}
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Plot dependent vs independent
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={dep}
              disabled={sweeping}
              onChange={(e) => {
                const d = e.target.value as Dep;
                setDep(d);
                if (d === "ncrit" && indep === "N") setIndep("swirlDeg");
              }}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-200"
            >
              <option value="omega">Ω (net rotation)</option>
              <option value="ncrit">N critical</option>
            </select>
            <span className="text-zinc-500">vs</span>
            <select
              value={indep}
              disabled={sweeping}
              onChange={(e) => setIndep(e.target.value as Var)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-200"
            >
              {indepOptions.map((v) => (
                <option key={v} value={v}>
                  {VLABEL[v]}
                </option>
              ))}
            </select>
            <button
              onClick={sweeping ? stopSweep : startSweep}
              className="ml-auto rounded-md border border-violet-500 bg-violet-500/15 px-3 py-1.5 font-medium text-violet-200 hover:bg-violet-500/25"
            >
              {sweeping ? `Stop (${progress.toFixed(0)}%)` : "Plot →"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-zinc-600">
            Holds the other variables at their slider values and computes the curve live.
            {dep === "ncrit" ? " (N critical re-scans N at each point — slower.)" : ""}
          </p>
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-4 text-sm">
        <Slider label="Number of discs N" value={P.N} min={3} max={64} step={1} disabled={sweeping}
          onChange={(v) => setParam("N", v, true)} readout={String(P.N)} />
        <Slider label="Swirl rate ω" value={P.swirlDeg} min={15} max={120} step={1} disabled={sweeping}
          onChange={(v) => setParam("swirlDeg", v, false)} readout={`${P.swirlDeg.toFixed(0)} °/s`} />
        <Slider label="Ball mass m" value={P.m} min={0.2} max={3} step={0.1} disabled={sweeping}
          onChange={(v) => setParam("m", v, false)} readout={P.m.toFixed(1)} />
        <Slider label="Swirl amplitude A" value={P.A} min={0.5} max={4} step={0.1} disabled={sweeping}
          onChange={(v) => setParam("A", v, true)} readout={P.A.toFixed(1)} />
        <Slider label="Ball radius r" value={P.rball} min={0.6} max={1.6} step={0.05} disabled={sweeping}
          onChange={(v) => setParam("rball", v, true)} readout={P.rball.toFixed(2)} />
        <Slider label="Container radius R" value={P.Rcont} min={5} max={12} step={0.2} disabled={sweeping}
          onChange={(v) => setParam("Rcont", v, true)} readout={P.Rcont.toFixed(1)} />
        <Slider label="Wall friction μ (ball–wall)" value={P.muBC} min={0} max={1.5} step={0.05} disabled={sweeping}
          onChange={(v) => setParam("muBC", v, false)} readout={P.muBC.toFixed(2)} />
        <Slider label="Ball friction μ (ball–ball)" value={P.muBB} min={0} max={1.5} step={0.05} disabled={sweeping}
          onChange={(v) => setParam("muBB", v, false)} readout={P.muBB.toFixed(2)} />
        <Slider label="Speed" value={speed} min={1} max={8} step={1}
          onChange={setSpeed} readout={`${speed}×`} />

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">View</div>
          <div className="inline-flex w-full rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
            {(["container", "lab"] as const).map((f) => (
              <button key={f} onClick={() => setFrame(f)}
                className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
                  frame === f ? "bg-violet-500/20 text-violet-200" : "text-zinc-400 hover:text-zinc-200"
                }`}>
                {f === "container" ? "Container" : "Lab"} frame
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setRunning((r) => !r)} disabled={sweeping}
            className="flex-1 rounded-md border border-zinc-700 py-2 font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-40">
            {running ? "Pause" : "Play"}
          </button>
          <button onClick={() => (resetFlag.current = true)} disabled={sweeping}
            className="flex-1 rounded-md border border-zinc-700 py-2 font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-40">
            Reset
          </button>
        </div>
      </div>
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
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  readout: string;
  disabled?: boolean;
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
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-violet-500 disabled:opacity-40"
      />
    </div>
  );
}
