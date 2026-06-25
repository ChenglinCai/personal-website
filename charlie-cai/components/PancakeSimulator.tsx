"use client";

import { useEffect, useRef, useState } from "react";
import { InlineMath } from "@/components/Math";

// Interactive "pancake rotation" (IYPT Q15 / swirled granular media), rebuilt to
// follow Lee et al., Phys. Rev. E 100, 012903 (2019). N discs sit in a circular
// dish whose centre is swirled around a small circle without spinning. The floor
// is frictionless; the only forces are collisions — elastic in the normal
// direction, Coulomb-friction tangential impulse with a stick clamp (Wang–Mason).
//
// Crucially, the dynamics are integrated in the *M-frame* (the frame co-rotating
// with the swirl, used in the paper). There the dish is stationary, its wall
// rotates at −ω about its own centre, and every disc feels a steady centrifugal
// force (pushing it to the wall, like gravity in a rotating drum) plus a Coriolis
// force. This is what lets even a small cluster settle against the wall and reach
// a statistical steady state — reproducing the experiment for all N.
//
// The swarm's lab-frame rotation is Ω_lab = Ω_M + ω. It is positive (co-rotating)
// for a loose cluster and crosses to negative (counter-rotating) once the pack
// jams and rolls no-slip on the wall. Every number shown is computed live.

const DT = 0.003;
const VCAP = 80; // generous safety clamp; should not bind in normal operation
const RAD2DEG = 180 / Math.PI;
const TRIALS = 10; // independent trials averaged per plotted data point
const MAXN_CAP = 90; // upper bound on N for the O(N²) collision loop

// I = INERTIA_COEF · m · r².  Lee et al. use I = 10 for r = m = 1; this large
// effective rotational inertia models the geometric frustration that stops
// densely packed discs from spinning freely.
const INERTIA_COEF = 10;
// Mild restitution (paper uses elastic collisions with an exact event-driven
// integrator; a fixed-step integrator needs a little dissipation for a steady
// state, and real grains are inelastic anyway).
const E_REST = 0.5;

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

const Iof = (p: Params) => INERTIA_COEF * p.m * p.rball * p.rball;

interface SimState {
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  w: Float64Array;
  phi: Float64Array;
  n: number;
  t: number;
}

// Hex pack inside the dish (centred on the dish centre C = (A,0)), closest first.
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
    t: 0,
  };
  for (let i = 0; i < n; i++) {
    s.x[i] = pts[i][0] + (Math.random() - 0.5) * 0.04;
    s.y[i] = pts[i][1] + (Math.random() - 0.5) * 0.04;
  }
  return s;
}

// One M-frame step. Dish centre C = (A,0) is fixed; wall rotates at −ω about C.
function step(s: SimState, p: Params) {
  const I = Iof(p);
  const om = (p.swirlDeg * Math.PI) / 180;
  const { m, A, rball, Rcont, muBB, muBC } = p;
  const e = E_REST;
  const Cx = A;
  const Cy = 0;
  s.t += DT;

  const { x, y, vx, vy, w, phi, n } = s;

  // Fictitious forces of the rotating frame: centrifugal ω²·r (from S = origin)
  // and Coriolis 2 v×ω. Semi-implicit Euler.
  for (let i = 0; i < n; i++) {
    const ax = om * om * x[i] + 2 * om * vy[i];
    const ay = om * om * y[i] - 2 * om * vx[i];
    vx[i] += ax * DT;
    vy[i] += ay * DT;
    x[i] += vx[i] * DT;
    y[i] += vy[i] * DT;
    phi[i] += w[i] * DT;
  }

  // Disc–disc collisions.
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
        const Jn = 0.5 * m * (1 + e) * (vin - vjn);
        const dvn = Jn / m;
        const nvin = vin - dvn;
        const nvjn = vjn + dvn;
        const vrel = vjt - vit + rball * (w[i] + w[j]);
        const s0 = Math.sign(vrel);
        const Jf =
          -s0 *
          Math.min(muBB * Math.abs(Jn), Math.abs(vrel) / (2 / m + (2 * rball * rball) / I));
        const nvit = vit - Jf / m;
        const nvjt = vjt + Jf / m;
        w[i] += (rball * Jf) / I;
        w[j] += (rball * Jf) / I;
        vx[i] = nvin * nx + nvit * tx;
        vy[i] = nvin * ny + nvit * ty;
        vx[j] = nvjn * nx + nvjt * tx;
        vy[j] = nvjn * ny + nvjt * ty;
      }
      const ov = d0 - d;
      x[i] -= 0.5 * ov * nx;
      y[i] -= 0.5 * ov * ny;
      x[j] += 0.5 * ov * nx;
      y[j] += 0.5 * ov * ny;
    }
  }

  // Disc–wall collisions. Wall point at P has velocity −ω×(P−C) = (ω·dy, −ω·dx).
  const lim = Rcont - rball;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - Cx;
    const dy = y[i] - Cy;
    const d2 = dx * dx + dy * dy;
    if (d2 <= lim * lim) continue;
    const d = Math.sqrt(d2);
    const nx = -dx / d; // inward normal
    const ny = -dy / d;
    const tx = ny;
    const ty = -nx;
    const uWx = om * dy;
    const uWy = -om * dx;
    const vin = vx[i] * nx + vy[i] * ny;
    const vit = vx[i] * tx + vy[i] * ty;
    const uWn = uWx * nx + uWy * ny;
    const uWt = uWx * tx + uWy * ty;
    if (vin - uWn < 0) {
      const nvin = (1 + e) * uWn - e * vin;
      const Jn = m * (nvin - vin);
      const vrel = vit - uWt + rball * w[i];
      const s0 = Math.sign(vrel);
      const Jf =
        -s0 * Math.min(muBC * Math.abs(Jn), Math.abs(vrel) / (1 / m + (rball * rball) / I));
      const nvit = vit + Jf / m;
      w[i] += (rball * Jf) / I;
      vx[i] = nvin * nx + nvit * tx;
      vy[i] = nvin * ny + nvit * ty;
    }
    x[i] = Cx + (dx / d) * lim;
    y[i] = Cy + (dy / d) * lim;
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

// Angular velocity of the cluster about its own centre of mass, in the M-frame
// (rad/s).
function omegaCOM_M(s: SimState): number {
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

// Lab-frame swarm rotation in deg/s: Ω_lab = Ω_M + ω.
function labOmegaDeg(s: SimState, p: Params): number {
  return omegaCOM_M(s) * RAD2DEG + p.swirlDeg;
}

function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}
function sweepValues(V: Var, base: Params): number[] {
  switch (V) {
    case "N": {
      const hi = Math.min(MAXN_CAP, packCount(base));
      const out: number[] = [];
      for (let v = 5; v <= hi; v += Math.max(2, Math.round((hi - 5) / 16))) out.push(v);
      return out;
    }
    case "swirlDeg":
      return linspace(30, 120, 9);
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

// Interpolate the N where Ω_lab crosses zero (co → counter).
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
  trial: number; // index of the current trial within this data point
  trialAcc: number; // sum of per-trial Ω means, averaged once TRIALS are done
  inner: { Ns: number[]; ni: number; data: [number, number][] } | null;
}

export default function PancakeSimulator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<HTMLCanvasElement>(null);

  const [P, setP] = useState<Params>({
    N: 10,
    swirlDeg: 70,
    m: 1,
    A: 1.9,
    rball: 1.0,
    Rcont: 8.6,
    muBB: 1.0,
    muBC: 1.0,
  });
  const [frame, setFrame] = useState<"mframe" | "dish" | "lab">("lab");
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
  const histRef = useRef<{ t: number; o: number }[]>([]);

  const setParam = (k: Var, v: number, reinit: boolean) => {
    setP((prev) => {
      const next = { ...prev, [k]: v };
      // ball radius, dish radius and amplitude all change how many discs fit;
      // clamp N down to what can actually be packed.
      if (k === "rball" || k === "Rcont" || k === "A") {
        const maxN = Math.min(MAXN_CAP, packCount(next));
        if (next.N > maxN) next.N = Math.max(3, maxN);
      }
      return next;
    });
    if (reinit) resetFlag.current = true;
  };

  const maxN = Math.min(MAXN_CAP, packCount(P));

  const beginRun = (sw: Sweep) => {
    sw.st = makeState(sw.p);
    sw.phase = "eq";
    sw.steps = 0;
    sw.acc = 0;
    sw.cnt = 0;
  };
  // Start a fresh data point: reset the trial accumulator, then begin trial 0.
  const beginUnit = (sw: Sweep) => {
    sw.trial = 0;
    sw.trialAcc = 0;
    beginRun(sw);
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
      eqSteps: Math.round((dep === "omega" ? 16 : 12) / DT),
      measSteps: Math.round((dep === "omega" ? 18 : 12) / DT),
      acc: 0,
      cnt: 0,
      trial: 0,
      trialAcc: 0,
      inner: null,
    };
    const setupValue = () => {
      const val = sw.values[sw.vi];
      if (sw.dep === "omega") {
        sw.p = { ...sw.base, [sw.V]: val };
        beginUnit(sw);
      } else {
        const pv = { ...sw.base, [sw.V]: val };
        const hi = Math.min(MAXN_CAP, packCount(pv));
        const Ns: number[] = [];
        for (let v = 5; v <= hi; v += Math.max(3, Math.round((hi - 5) / 9))) Ns.push(v);
        sw.inner = { Ns, ni: 0, data: [] };
        sw.p = { ...pv, N: Ns[0] };
        beginUnit(sw);
      }
    };
    sweepRef.current = sw;
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

    const drawSim = (s: SimState, p: Params, fr: "mframe" | "dish" | "lab") => {
      cx.clearRect(0, 0, W, W);
      cx.fillStyle = "#0a0a12";
      cx.fillRect(0, 0, W, W);

      const om = (p.swirlDeg * Math.PI) / 180;
      const th = om * s.t;
      const ct = Math.cos(th);
      const st = Math.sin(th);
      // Map M-frame coordinates to the chosen view frame:
      //   mframe — identity (dish centre fixed, axes co-rotate with the swirl)
      //   lab    — rotate by +θ about the swirl axis S (what you actually see)
      //   dish   — translate to the dish centre, then rotate by +θ, giving a
      //            frame whose origin tracks the dish centre but whose axes stay
      //            fixed to the lab (the non-spinning dish frame)
      const toView = (wx: number, wy: number): [number, number] => {
        if (fr === "lab") return [wx * ct - wy * st, wx * st + wy * ct];
        if (fr === "dish") {
          const rx = wx - p.A;
          return [rx * ct - wy * st, rx * st + wy * ct];
        }
        return [wx, wy];
      };

      // dish centre C = (A,0) in M-frame, mapped into the view
      const [Cvx, Cvy] = toView(p.A, 0);
      const span = fr === "lab" ? p.A + p.Rcont : p.Rcont * 1.06;
      const scale = (W * 0.46) / span;
      // centre the view: M-frame on dish centre C; lab & dish frames on origin
      const ox = fr === "mframe" ? p.A : 0;
      const oy = 0;
      const SX = (wx: number) => W / 2 + (wx - ox) * scale;
      const SY = (wy: number) => W / 2 - (wy - oy) * scale;

      // dish
      cx.beginPath();
      cx.arc(SX(Cvx), SY(Cvy), p.Rcont * scale, 0, Math.PI * 2);
      cx.strokeStyle = "rgba(255,255,255,0.35)";
      cx.lineWidth = 2;
      cx.stroke();

      // swirl-orbit circle (radius A). In the lab view it is the path of the
      // dish centre about S; in the dish view it is the path of S about the
      // (now fixed) dish centre. Both are circles of radius A.
      if (fr === "lab" || fr === "dish") {
        const ccx = fr === "lab" ? SX(0) : SX(Cvx);
        const ccy = fr === "lab" ? SY(0) : SY(Cvy);
        cx.beginPath();
        cx.arc(ccx, ccy, p.A * scale, 0, Math.PI * 2);
        cx.strokeStyle = "rgba(167,139,250,0.25)";
        cx.lineWidth = 1;
        cx.stroke();
      }

      const rball = p.rball * scale;
      for (let i = 0; i < s.n; i++) {
        const [px0, py0] = toView(s.x[i], s.y[i]);
        const px = SX(px0);
        const py = SY(py0);
        cx.beginPath();
        cx.arc(px, py, rball, 0, Math.PI * 2);
        cx.fillStyle = "#a78bfa";
        cx.fill();
        // spin tick (rotate the body angle into the view frame where axes turn)
        const ang = fr === "mframe" ? s.phi[i] : s.phi[i] + th;
        cx.beginPath();
        cx.moveTo(px, py);
        cx.lineTo(px + Math.cos(ang) * rball * 0.85, py - Math.sin(ang) * rball * 0.85);
        cx.strokeStyle = "rgba(10,10,18,0.8)";
        cx.lineWidth = Math.max(1, rball * 0.18);
        cx.stroke();
      }

      // centre of mass (white dot)
      if (s.n > 0) {
        let mx = 0;
        let my = 0;
        for (let i = 0; i < s.n; i++) {
          mx += s.x[i];
          my += s.y[i];
        }
        mx /= s.n;
        my /= s.n;
        const [mvx, mvy] = toView(mx, my);
        cx.beginPath();
        cx.arc(SX(mvx), SY(mvy), 5, 0, Math.PI * 2);
        cx.fillStyle = "#ffffff";
        cx.fill();
        cx.lineWidth = 1.5;
        cx.strokeStyle = "rgba(10,10,18,0.9)";
        cx.stroke();
      }

      // centre of the dish (red dot) — always shown. The dish only translates
      // (it never spins in the lab frame), so this dot traces the swirl circle
      // in the lab view and stays put in the M-frame and dish-frame views.
      cx.beginPath();
      cx.arc(SX(Cvx), SY(Cvy), 4, 0, Math.PI * 2);
      cx.fillStyle = "#ef4444";
      cx.fill();
      cx.lineWidth = 1.5;
      cx.strokeStyle = "rgba(10,10,18,0.9)";
      cx.stroke();

      // A reference mark "painted" on the dish rim, with a faint radial spoke to
      // the dish centre. Since the dish only translates (it never spins in the
      // lab frame), this mark keeps a fixed orientation in the lab and dish
      // frames, and sweeps around the rim only in the rotating M-frame. As a
      // dish-fixed point it sits at M-frame position (A + R·sinθ, R·cosθ).
      const markX = p.A + p.Rcont * st;
      const markY = p.Rcont * ct;
      const [mkx, mky] = toView(markX, markY);
      cx.beginPath();
      cx.moveTo(SX(Cvx), SY(Cvy));
      cx.lineTo(SX(mkx), SY(mky));
      cx.strokeStyle = "rgba(251,191,36,0.45)";
      cx.lineWidth = 1.5;
      cx.stroke();
      cx.beginPath();
      cx.arc(SX(mkx), SY(mky), 4, 0, Math.PI * 2);
      cx.fillStyle = "rgba(251,191,36,0.95)";
      cx.fill();

      // In the lab and dish views, mark the swirl axis S (the point the dish
      // translates around) as a violet dot.
      if (fr === "lab" || fr === "dish") {
        const [sx0, sy0] = toView(0, 0);
        cx.beginPath();
        cx.arc(SX(sx0), SY(sy0), 3, 0, Math.PI * 2);
        cx.fillStyle = "rgba(167,139,250,0.8)";
        cx.fill();
      }
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
      const yl = isOmega ? "Ω lab (°/s)" : "N critical";
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

    const drawTimeSeries = (
      g: CanvasRenderingContext2D,
      w: number,
      h: number,
      hist: { t: number; o: number }[]
    ) => {
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

      if (hist.length < 2) {
        g.fillStyle = "rgba(255,255,255,0.3)";
        g.fillText("Net rotation Ω will trace here as the swarm spins up…", padL + 6, padT + ph / 2);
        return;
      }
      const t0 = hist[0].t;
      const t1 = hist[hist.length - 1].t;
      let yhi = 0;
      for (const s of hist) yhi = Math.max(yhi, Math.abs(s.o));
      yhi = Math.max(yhi * 1.15, 10);
      const ylo = -yhi;
      const X = (t: number) => padL + ((t - t0) / (t1 - t0 || 1)) * pw;
      const Y = (o: number) => padT + ph - ((o - ylo) / (yhi - ylo || 1)) * ph;

      // zero line + co/counter labels
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

      // axes
      g.strokeStyle = "rgba(255,255,255,0.18)";
      g.beginPath();
      g.moveTo(padL, padT);
      g.lineTo(padL, padT + ph);
      g.lineTo(padL + pw, padT + ph);
      g.stroke();
      g.fillStyle = "rgba(255,255,255,0.4)";
      g.fillText(yhi.toFixed(0), 8, Y(yhi) + 3);
      g.fillText(ylo.toFixed(0), 12, Y(ylo) + 3);
      g.fillText("0", 28, y0 + 3);
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.fillText("Ω lab (°/s) vs time →", padL, 11);

      // trace
      g.strokeStyle = "#a78bfa";
      g.lineWidth = 1.5;
      g.beginPath();
      hist.forEach((s, i) => (i ? g.lineTo(X(s.t), Y(s.o)) : g.moveTo(X(s.t), Y(s.o))));
      g.stroke();

      // current value marker
      const last = hist[hist.length - 1];
      g.fillStyle = last.o >= 0 ? "#34d399" : "#fb923c";
      g.beginPath();
      g.arc(X(last.t), Y(last.o), 2.8, 0, Math.PI * 2);
      g.fill();
    };

    let raf = 0;
    let frames = 0;
    const frame = () => {
      const c = ctrl.current;
      const sw = sweepRef.current;

      if (sw && sw.active) {
        const chunk = 1800;
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
            sw.acc += labOmegaDeg(sw.st, sw.p);
            sw.cnt++;
            if (sw.steps >= sw.measSteps) {
              // one trial finished — bank it and run more trials before recording
              sw.trialAcc += sw.acc / sw.cnt;
              sw.trial++;
              if (sw.trial < TRIALS) {
                beginRun(sw); // fresh random configuration, same parameters
                break;
              }
              const om = sw.trialAcc / TRIALS; // average over TRIALS trials
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
                  beginUnit(sw);
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
          const trialFrac = sw.trial / TRIALS;
          const frac = sw.inner
            ? (sw.vi + (sw.inner.ni + trialFrac) / Math.max(1, sw.inner.Ns.length)) /
              sw.values.length
            : (sw.vi + trialFrac) / sw.values.length;
          setProgress(Math.min(100, frac * 100));
        }
        raf = requestAnimationFrame(frame);
        return;
      }

      // live mode
      if (resetFlag.current) {
        simRef.current = makeState(c.P);
        omEMA.current = 0;
        histRef.current = [];
        resetFlag.current = false;
      }
      const s = simRef.current!;
      if (c.running) {
        const steps = Math.max(1, Math.round(2 * c.speed));
        for (let k = 0; k < steps; k++) step(s, c.P);
        omEMA.current = omEMA.current * 0.97 + labOmegaDeg(s, c.P) * 0.03;
        histRef.current.push({ t: s.t, o: omEMA.current });
        if (histRef.current.length > 700) histRef.current.shift();
      }
      drawSim(s, c.P, c.frame);
      if (graph && gctx) drawTimeSeries(gctx, gW, gH, histRef.current);
      frames++;
      if (frames % 8 === 0) setOmega(omEMA.current);
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
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Swarm rotation Ω (lab)</div>
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
            <div className="text-[10px] text-zinc-600">white = centre of mass · red = dish centre</div>
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
            Holds the other variables at their slider values and computes the curve
            live, averaging {TRIALS} independent trials per data point.
            {dep === "ncrit" ? " (N critical re-scans N at each point — slower.)" : ""}
          </p>
          <dl className="mt-3 space-y-1.5 border-t border-zinc-800 pt-3 text-[11px] leading-relaxed text-zinc-500">
            <div>
              <span className="font-medium text-zinc-300">
                <InlineMath>{String.raw`\Omega`}</InlineMath> (net rotation)
              </span>{" "}
              — the swarm&apos;s mean angular velocity about its own centre of mass,
              in the lab frame:{" "}
              <InlineMath>{String.raw`\Omega = \Omega_M + \omega`}</InlineMath>,
              averaged over time and over all discs.{" "}
              <InlineMath>{String.raw`\Omega > 0`}</InlineMath> co-rotates with the
              swirl; <InlineMath>{String.raw`\Omega < 0`}</InlineMath>{" "}
              counter-rotates.
            </div>
            <div>
              <span className="font-medium text-zinc-300">
                N critical (<InlineMath>{String.raw`N_c`}</InlineMath>)
              </span>{" "}
              — the number of discs at which{" "}
              <InlineMath>{String.raw`\Omega`}</InlineMath> first crosses zero, i.e.
              the tipping point of the co→counter transition.
            </div>
          </dl>
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-4 text-sm">
        <Slider label="Number of discs N" value={Math.min(P.N, maxN)} min={3} max={maxN} step={1} disabled={sweeping}
          onChange={(v) => setParam("N", v, true)} readout={`${Math.min(P.N, maxN)} / ${maxN} max`} />
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
            {(["mframe", "dish", "lab"] as const).map((f) => (
              <button key={f} onClick={() => setFrame(f)}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                  frame === f ? "bg-violet-500/20 text-violet-200" : "text-zinc-400 hover:text-zinc-200"
                }`}>
                {f === "mframe" ? "M-frame" : f === "dish" ? "Dish frame" : "Lab frame"}
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
