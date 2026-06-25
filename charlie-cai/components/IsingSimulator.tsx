"use client";

import { useEffect, useRef, useState } from "react";

// A small, live Ising-model visualization. A lattice of spins (±1) that each
// prefer to match their neighbours, simulated with the Metropolis Monte Carlo
// algorithm. Switch between 1D, 2D and 3D and drag the temperature to watch
// order appear and dissolve, or run a temperature sweep to plot |M| vs T and
// see the phase transition directly.
//   • 1D — shown as a space-time diagram; never orders (Tc = 0).
//   • 2D — a lattice; orders below Tc ≈ 2.269.
//   • 3D — shown as a montage of 2D slices through the cube; orders below
//          Tc ≈ 4.512.

const N = 96; // 1D / 2D display lattice size
const N3 = 24; // 3D cube side
const TC2 = 2.269;
const TC3 = 4.5115;

const UP: [number, number, number] = [196, 181, 253];
const DOWN: [number, number, number] = [17, 14, 33];

// ---- Metropolis updates (operate on a flat array of side L) ----------------

function metro1D(c: Int8Array, L: number, T: number, flips: number) {
  const w4 = Math.exp(-4 / T);
  for (let f = 0; f < flips; f++) {
    const i = (Math.random() * L) | 0;
    const s = c[i];
    const sum = c[(i + L - 1) % L] + c[(i + 1) % L];
    const dE = 2 * s * sum;
    if (dE <= 0 || Math.random() < w4) c[i] = -s as 1 | -1;
  }
}

function metro2D(g: Int8Array, L: number, T: number, flips: number) {
  const w4 = Math.exp(-4 / T);
  const w8 = Math.exp(-8 / T);
  for (let f = 0; f < flips; f++) {
    const i = (Math.random() * L) | 0;
    const j = (Math.random() * L) | 0;
    const idx = i * L + j;
    const s = g[idx];
    const sum =
      g[((i + L - 1) % L) * L + j] +
      g[((i + 1) % L) * L + j] +
      g[i * L + ((j + L - 1) % L)] +
      g[i * L + ((j + 1) % L)];
    const dE = 2 * s * sum;
    if (dE <= 0 || Math.random() < (dE === 4 ? w4 : w8)) g[idx] = -s as 1 | -1;
  }
}

function metro3D(g: Int8Array, L: number, T: number, flips: number) {
  const w4 = Math.exp(-4 / T);
  const w8 = Math.exp(-8 / T);
  const w12 = Math.exp(-12 / T);
  for (let f = 0; f < flips; f++) {
    const i = (Math.random() * L) | 0;
    const j = (Math.random() * L) | 0;
    const k = (Math.random() * L) | 0;
    const idx = (i * L + j) * L + k;
    const s = g[idx];
    const sum =
      g[(((i + L - 1) % L) * L + j) * L + k] +
      g[(((i + 1) % L) * L + j) * L + k] +
      g[(i * L + ((j + L - 1) % L)) * L + k] +
      g[(i * L + ((j + 1) % L)) * L + k] +
      g[(i * L + j) * L + ((k + L - 1) % L)] +
      g[(i * L + j) * L + ((k + 1) % L)];
    const dE = 2 * s * sum;
    if (dE <= 0 || Math.random() < (dE === 4 ? w4 : dE === 8 ? w8 : w12))
      g[idx] = -s as 1 | -1;
  }
}

function sumSpins(a: Int8Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
}

type Dim = 1 | 2 | 3;

interface Meas {
  active: boolean;
  dim: Dim;
  L: number;
  Tlist: number[];
  Tmax: number;
  ti: number;
  phase: "eq" | "meas";
  sweeps: number;
  eqTarget: number;
  measTarget: number;
  magAccum: number;
  magCount: number;
  lat: Int8Array;
  results: [number, number][];
}

export default function IsingSimulator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<HTMLCanvasElement>(null);

  const [dim, setDim] = useState<Dim>(2);
  const [temp, setTemp] = useState(2.2);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [mag, setMag] = useState(0);
  const [measuring, setMeasuring] = useState(false);

  const ctrl = useRef({ dim, temp, running, speed });
  ctrl.current = { dim, temp, running, speed };

  const grid2d = useRef<Int8Array>(new Int8Array(N * N));
  const grid3d = useRef<Int8Array>(new Int8Array(N3 * N3 * N3));
  const chain1d = useRef<Int8Array>(new Int8Array(N));
  const history = useRef<Int8Array[]>([]);
  const measRef = useRef<Meas | null>(null);

  const randomize = () => {
    for (const g of [grid2d.current, grid3d.current, chain1d.current])
      for (let i = 0; i < g.length; i++) g[i] = Math.random() < 0.5 ? 1 : -1;
    history.current = [];
  };
  if (grid2d.current[0] === 0) randomize();

  const startSweep = () => {
    const d = ctrl.current.dim;
    const L = d === 1 ? 256 : d === 2 ? 40 : 20;
    const Tmin = d === 1 ? 0.1 : d === 2 ? 0.4 : 1;
    const Tmax = d === 1 ? 4 : d === 2 ? 4 : 6.5;
    const n = 48;
    const Tlist = Array.from(
      { length: n },
      (_, i) => Tmin + ((Tmax - Tmin) * i) / (n - 1)
    );
    const size = d === 1 ? L : d === 2 ? L * L : L * L * L;
    measRef.current = {
      active: true,
      dim: d,
      L,
      Tlist,
      Tmax,
      ti: 0,
      phase: "eq",
      sweeps: 0,
      eqTarget: 20,
      measTarget: 30,
      magAccum: 0,
      magCount: 0,
      lat: new Int8Array(size).fill(1),
      results: [],
    };
    setMeasuring(true);
  };
  const stopSweep = () => {
    if (measRef.current) measRef.current.active = false;
    setMeasuring(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const graph = graphRef.current;
    if (!canvas) return;
    const cx = canvas.getContext("2d");
    const gctx = graph ? graph.getContext("2d") : null;
    if (!cx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Cache of offscreen pixel surfaces keyed by size.
    const surfaces = new Map<
      string,
      { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData }
    >();
    const getSurface = (w: number, h: number) => {
      const key = `${w}x${h}`;
      let s = surfaces.get(key);
      if (!s) {
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        const c2 = cv.getContext("2d")!;
        s = { cv, ctx: c2, img: c2.createImageData(w, h) };
        surfaces.set(key, s);
      }
      return s;
    };

    let W = 0;
    let gW = 0;
    const gH = 180;
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

    const blit = (cv: HTMLCanvasElement) => {
      cx.globalAlpha = 1;
      cx.globalCompositeOperation = "source-over";
      cx.clearRect(0, 0, W, W);
      cx.imageSmoothingEnabled = false;
      cx.drawImage(cv, 0, 0, W, W);
    };
    const setPx = (d: Uint8ClampedArray, k: number, up: boolean) => {
      const c = up ? UP : DOWN;
      d[k] = c[0];
      d[k + 1] = c[1];
      d[k + 2] = c[2];
      d[k + 3] = 255;
    };

    const renderGrid = (g: Int8Array, L: number) => {
      const s = getSurface(L, L);
      for (let p = 0; p < L * L; p++) setPx(s.img.data, p * 4, g[p] > 0);
      s.ctx.putImageData(s.img, 0, 0);
      blit(s.cv);
    };
    const render1DStretch = (c: Int8Array, L: number) => {
      const s = getSurface(L, 1);
      for (let p = 0; p < L; p++) setPx(s.img.data, p * 4, c[p] > 0);
      s.ctx.putImageData(s.img, 0, 0);
      blit(s.cv);
    };
    const renderSpaceTime = () => {
      const s = getSurface(N, N);
      const hist = history.current;
      const rows = hist.length;
      const offset = N - rows;
      for (let y = 0; y < N; y++) {
        const row = y >= offset ? hist[y - offset] : null;
        for (let x = 0; x < N; x++)
          setPx(s.img.data, (y * N + x) * 4, row ? row[x] > 0 : false);
      }
      s.ctx.putImageData(s.img, 0, 0);
      blit(s.cv);
    };
    // See-through 3D block: project each spin into an isometric, slowly
    // rotating view. Up-spins glow violet (additively, so dense aligned domains
    // shine through); down-spins are a faint haze so the block stays visible
    // even when it orders downward. No depth sort needed — additive blending is
    // order-independent.
    const renderBlock = (g: Int8Array, L: number, angle: number) => {
      cx.globalAlpha = 1;
      cx.globalCompositeOperation = "source-over";
      cx.fillStyle = "#06060c";
      cx.fillRect(0, 0, W, W);
      cx.globalCompositeOperation = "lighter";

      const c = (L - 1) / 2;
      const cosT = Math.cos(angle);
      const sinT = Math.sin(angle);
      const P = 0.5; // fixed downward tilt
      const cosP = Math.cos(P);
      const sinP = Math.sin(P);
      const scale = W / (L * 1.8);
      const R = c * 1.8 || 1;
      const size = scale * 1.15;

      // Two passes (down faint, then up bright) so the fill color is set just
      // twice instead of re-parsed per voxel.
      for (let pass = 0; pass < 2; pass++) {
        const wantUp = pass === 1;
        cx.fillStyle = wantUp ? "#c4b5fd" : "#3b3a7a";
        const baseAlpha = wantUp ? 0.18 : 0.045;
        for (let i = 0; i < L; i++) {
          const dx = i - c;
          for (let j = 0; j < L; j++) {
            const dy = j - c;
            const rx = dx * cosT - dy * sinT;
            const ry = dx * sinT + dy * cosT;
            const base = (i * L + j) * L;
            const pxX = W / 2 + rx * scale;
            for (let k = 0; k < L; k++) {
              if (g[base + k] > 0 !== wantUp) continue;
              const dz = k - c;
              const Y = ry * cosP - dz * sinP;
              const Z = ry * sinP + dz * cosP;
              const py = W / 2 - Z * scale;
              const d01 = Math.min(1, Math.max(0, (Y / R + 1) / 2));
              cx.globalAlpha = baseAlpha * (1 - 0.55 * d01);
              cx.fillRect(pxX - size / 2, py - size / 2, size, size);
            }
          }
        }
      }
      cx.globalAlpha = 1;
      cx.globalCompositeOperation = "source-over";
    };

    const drawGraph = (
      g: CanvasRenderingContext2D,
      w: number,
      h: number,
      results: [number, number][],
      Tmax: number,
      d: Dim
    ) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = "#0a0a12";
      g.fillRect(0, 0, w, h);
      const padL = 40;
      const padR = 12;
      const padT = 16;
      const padB = 22;
      const pw = Math.max(10, w - padL - padR);
      const ph = Math.max(10, h - padT - padB);
      g.font = "10px ui-sans-serif, system-ui";
      const X = (t: number) => padL + (t / Tmax) * pw;
      const Y = (m: number) => padT + ph - m * ph;

      for (const yv of [0, 0.25, 0.5, 0.75, 1]) {
        const yy = Y(yv);
        g.strokeStyle = "rgba(255,255,255,0.06)";
        g.beginPath();
        g.moveTo(padL, yy);
        g.lineTo(padL + pw, yy);
        g.stroke();
        g.fillStyle = "rgba(255,255,255,0.4)";
        g.fillText(yv.toFixed(2), 6, yy + 3);
      }
      for (let t = 0; t <= Tmax; t++) {
        g.fillStyle = "rgba(255,255,255,0.4)";
        g.fillText(String(t), X(t) - 3, padT + ph + 13);
      }
      g.strokeStyle = "rgba(255,255,255,0.18)";
      g.beginPath();
      g.moveTo(padL, padT);
      g.lineTo(padL, padT + ph);
      g.lineTo(padL + pw, padT + ph);
      g.stroke();

      const tc = d === 2 ? TC2 : d === 3 ? TC3 : null;
      if (tc && tc <= Tmax) {
        const xx = X(tc);
        g.strokeStyle = "rgba(251,191,36,0.5)";
        g.setLineDash([4, 3]);
        g.beginPath();
        g.moveTo(xx, padT);
        g.lineTo(xx, padT + ph);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = "rgba(251,191,36,0.85)";
        g.fillText("Tc", xx + 3, padT + 9);
      }

      if (results.length > 0) {
        g.strokeStyle = "#a78bfa";
        g.lineWidth = 1.5;
        g.beginPath();
        results.forEach(([t, m], i) =>
          i ? g.lineTo(X(t), Y(m)) : g.moveTo(X(t), Y(m))
        );
        g.stroke();
        g.fillStyle = "#a78bfa";
        for (const [t, m] of results) {
          g.beginPath();
          g.arc(X(t), Y(m), 1.6, 0, Math.PI * 2);
          g.fill();
        }
      } else {
        g.fillStyle = "rgba(255,255,255,0.3)";
        g.fillText("Run a temperature sweep to plot |M| vs T…", padL + 6, padT + ph / 2);
      }
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.fillText("Magnetization |M| vs temperature", padL, 11);
    };

    const runMeasureChunk = (m: Meas) => {
      const T = m.Tlist[m.ti];
      const flips = m.dim === 1 ? m.L : m.dim === 2 ? m.L * m.L : m.L * m.L * m.L;
      for (let c = 0; c < 6; c++) {
        if (m.dim === 2) metro2D(m.lat, m.L, T, flips);
        else if (m.dim === 3) metro3D(m.lat, m.L, T, flips);
        else metro1D(m.lat, m.L, T, flips);
        m.sweeps++;
        if (m.phase === "eq") {
          if (m.sweeps >= m.eqTarget) {
            m.phase = "meas";
            m.sweeps = 0;
            m.magAccum = 0;
            m.magCount = 0;
          }
        } else {
          m.magAccum += Math.abs(sumSpins(m.lat)) / flips;
          m.magCount++;
          if (m.sweeps >= m.measTarget) {
            m.results.push([T, m.magAccum / m.magCount]);
            m.ti++;
            if (m.ti >= m.Tlist.length) {
              m.active = false;
              setMeasuring(false);
              break;
            }
            m.phase = "eq";
            m.sweeps = 0;
          }
        }
      }
    };

    let raf = 0;
    let frames = 0;
    let blockAngle = 0;
    const frame = () => {
      const c = ctrl.current;
      const m = measRef.current;
      blockAngle += 0.012;

      if (m && m.active) {
        runMeasureChunk(m);
        if (m.dim === 2) renderGrid(m.lat, m.L);
        else if (m.dim === 3) renderBlock(m.lat, m.L, blockAngle);
        else render1DStretch(m.lat, m.L);
      } else {
        const T = Math.max(0.05, c.temp);
        if (c.running) {
          if (c.dim === 2) metro2D(grid2d.current, N, T, Math.floor(N * N * c.speed));
          else if (c.dim === 3)
            metro3D(grid3d.current, N3, T, Math.floor(N3 * N3 * N3 * c.speed));
          else {
            metro1D(chain1d.current, N, T, Math.floor(N * 2 * c.speed));
            history.current.push(Int8Array.from(chain1d.current));
            if (history.current.length > N) history.current.shift();
          }
        }
        if (c.dim === 2) renderGrid(grid2d.current, N);
        else if (c.dim === 3) renderBlock(grid3d.current, N3, blockAngle);
        else renderSpaceTime();
      }

      if (graph && gctx) {
        const gd: Dim = m ? m.dim : c.dim;
        const tmax = m ? m.Tmax : c.dim === 3 ? 6.5 : 4;
        drawGraph(gctx, gW, gH, m ? m.results : [], tmax, gd);
      }

      frames++;
      if (frames % 8 === 0) {
        let arr: Int8Array;
        let dd: Dim;
        if (m && m.active) {
          arr = m.lat;
          dd = m.dim;
        } else {
          dd = c.dim;
          arr = dd === 2 ? grid2d.current : dd === 3 ? grid3d.current : chain1d.current;
        }
        setMag(Math.abs(sumSpins(arr)) / arr.length);
        void dd;
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const caption =
    dim === 2
      ? "2D lattice — each cell is a spin; bright = up, dark = down."
      : dim === 3
        ? "3D cube as a see-through, slowly rotating block — bright clusters are aligned (up) regions."
        : "1D chain as a space-time diagram — each row is a later moment, flowing down.";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div>
        <canvas
          ref={canvasRef}
          className="w-full rounded-xl border border-zinc-800 bg-[#0a0a12]"
        />
        <p className="mt-2 text-xs text-zinc-500">
          {measuring ? "Sweeping temperature — watch the lattice and the curve." : caption}
        </p>
        <canvas
          ref={graphRef}
          className="mt-4 w-full rounded-xl border border-zinc-800 bg-[#0a0a12]"
        />
      </div>

      <div className="space-y-6 text-sm">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Dimension
          </div>
          <div className="inline-flex w-full rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
            {([1, 2, 3] as const).map((d) => (
              <button
                key={d}
                disabled={measuring}
                onClick={() => {
                  setDim(d);
                  history.current = [];
                }}
                className={`flex-1 rounded-md py-1.5 font-medium transition-colors disabled:opacity-40 ${
                  dim === d
                    ? "bg-violet-500/20 text-violet-200"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {d}D
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-zinc-300">Temperature</span>
            <span className="text-xs text-zinc-500">{temp.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={6.5}
            step={0.02}
            value={temp}
            disabled={measuring}
            onChange={(e) => setTemp(parseFloat(e.target.value))}
            className="w-full accent-violet-500 disabled:opacity-40"
          />
          <p className="mt-1 text-xs text-zinc-500">
            {dim === 1 ? (
              "In 1D there is no ordering temperature — Tc = 0."
            ) : (
              <>
                Critical point Tc ≈ {dim === 2 ? "2.269" : "4.512"}.{" "}
                {temp < (dim === 2 ? TC2 : TC3) ? (
                  <span className="text-emerald-400">ordered</span>
                ) : (
                  <span className="text-amber-400">disordered</span>
                )}
              </>
            )}
          </p>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-zinc-300">Speed</span>
            <span className="text-xs text-zinc-500">{speed.toFixed(2)}×</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={3}
            step={0.1}
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="w-full accent-violet-500"
          />
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            Magnetization |M|
          </div>
          <div className="font-display text-lg font-semibold text-zinc-100">
            {mag.toFixed(3)}
          </div>
          <div className="text-[10px] text-zinc-600">0 = random, 1 = fully aligned</div>
        </div>

        <button
          onClick={measuring ? stopSweep : startSweep}
          className="w-full rounded-md border border-violet-500 bg-violet-500/15 py-2 font-medium text-violet-200 hover:bg-violet-500/25"
        >
          {measuring ? "Stop sweep" : "Sweep temperature →"}
        </button>

        <div className="flex gap-2">
          <button
            onClick={() => setRunning((r) => !r)}
            disabled={measuring}
            className="flex-1 rounded-md border border-zinc-700 py-2 font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-40"
          >
            {running ? "Pause" : "Play"}
          </button>
          <button
            onClick={randomize}
            disabled={measuring}
            className="flex-1 rounded-md border border-zinc-700 py-2 font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-40"
          >
            Randomize
          </button>
        </div>
      </div>
    </div>
  );
}
