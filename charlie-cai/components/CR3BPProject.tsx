"use client";

import { useState } from "react";
import Link from "next/link";
import CR3BPSimulator from "@/components/CR3BPSimulator";

const REPO = "https://github.com/ChenglinCai/CR3BP";
const PAPER = "/papers/cr3bp.html";

export default function CR3BPProject() {
  const [view, setView] = useState<"interactive" | "paper">("interactive");

  return (
    <main className="max-w-5xl mx-auto px-8 pt-32 pb-24">
      <Link
        href="/projects"
        className="text-sm text-zinc-500 hover:text-violet-400 transition-colors"
      >
        ← Projects
      </Link>

      {/* Header */}
      <header className="mt-8 mb-10">
        <p className="text-violet-300/70 text-xs tracking-[0.25em] uppercase mb-4 font-display">
        </p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-zinc-100 leading-tight">
          The Three-Body Problem
        </h1>

        {/* Plain-language explainer — for everyone */}
        <p className="text-zinc-300 mt-6 max-w-3xl leading-relaxed text-lg">
          Two large objects in space — say a star and a planet — pull on each
          other and settle into a steady orbit. Now add a third, much lighter
          object, like a spacecraft. Where can it sit? Remarkably, there are
          five “parking spots” where the pulls of the two big bodies balance
          out, so the little one can ride along for free. Some of these spots
          hold an object steady; others are precarious — the faintest nudge and
          it slowly drifts away.
        </p>
        <p className="text-zinc-400 mt-4 max-w-3xl leading-relaxed">
          This project asks which spots are stable, why, and how a spacecraft
          can stay put — the very problem NASA solves to keep the James Webb
          Space Telescope on station. You can explore the whole system yourself
          below, or read the full paper.
        </p>

        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-6 text-sm">
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">
            Code on GitHub ↗
          </a>
          <a href={PAPER} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">
            Open paper in new tab ↗
          </a>
        </div>
      </header>

      {/* Top toggle — interactive first */}
      <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/50 p-1 mb-10">
        {(["interactive", "paper"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-5 py-2 text-sm font-medium transition-colors ${
              view === v
                ? "bg-violet-500/20 text-violet-200"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {v === "interactive" ? "Interactive system" : "Read the paper"}
          </button>
        ))}
      </div>

      {view === "interactive" ? (
        <>
          <section>
            <p className="text-zinc-400 text-sm mb-5 max-w-3xl leading-relaxed">
              You&apos;re looking at the system in the{" "}
              <strong className="text-zinc-200">co-rotating frame</strong> — the
              camera spins along with the two big bodies, so they appear to stand
              still. The glowing background is the “gravity landscape”; the five
              balance points are marked. Launch a satellite from any of them and
              watch what happens.
            </p>

            <Legend />

            <div className="mt-6">
              <CR3BPSimulator />
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3 text-sm text-zinc-400">
              <Tip title="Mass ratio matters">
                Points L4 and L5 only become stable once the two bodies differ
                enough in mass (ratio ≥ 24.96). Drag μ across that line and watch
                them flip from green to amber.
              </Tip>
              <Tip title="A nudge can be fatal">
                Near L1, L2 and L3, even a tiny push grows exponentially — the
                drift graph curves upward fast. That growth rate is the paper&apos;s
                “e-folding time.”
              </Tip>
              <Tip title="Station-keeping saves it">
                Switch on station-keeping — a gentle, continuous thrust — to pin a
                satellite to an otherwise hopeless point, just like JWST does at
                L2.
              </Tip>
            </div>
          </section>

          {/* Narrative: value, contribution, discussions */}
          <article className="mt-20 max-w-3xl space-y-16">
            <Writeup title="Why this problem matters">
              <p>
                Three bodies pulling on each other gravitationally have no
                general solution — the motion is chaotic. The special case of two
                heavy bodies and one light one, though, is solvable, and it
                describes a lot of the real universe. Its five balance points
                (the <strong className="text-zinc-200">Lagrange points</strong>)
                let a spacecraft hover for almost no fuel, which is why
                observatories like SOHO and the James Webb Space Telescope are
                parked there. JWST&apos;s point is unstable, so it must thrust
                every few weeks — the stability question this project looks at.
                Extended to two-star systems, the same math bears on which
                exoplanets could hold an orbit steady enough to stay habitable.
              </p>
            </Writeup>

            <Writeup title="What I built">
              <ul>
                <li>
                  A numerical integrator (Python) that simulates the motion in
                  both the rotating and the fixed frame, used to check the
                  positions of the five balance points.
                </li>
                <li>
                  A station-keeping method that holds a satellite on an unstable
                  point while correcting the error a long simulation accumulates.
                </li>
                <li>
                  A study of how orbital stability depends on the two bodies&apos;
                  mass ratio and on the size of the initial perturbation.
                </li>
                <li>
                  An extension to eccentric, tilted binary-star systems using the
                  MERCURY N-body code, connected to planetary habitability.
                </li>
              </ul>
            </Writeup>

            <Writeup title="What I found interesting">
              <ul>
                <li>
                  L1 and L2 are unstable enough that the computer&apos;s rounding
                  error alone sends a satellite off within ~23 days — numerical
                  error and a real nudge are indistinguishable.
                </li>
                <li>
                  Unstable orbits are still bound: a small disturbance can grow,
                  drift far, then return — about 1,300 years for L3.
                </li>
                <li>
                  L4 and L5 are stable only when the heavier body is roughly 25×
                  the lighter one; below that they become unstable.
                </li>
                <li>
                  In tilted binary systems, a planet&apos;s eccentricity and
                  inclination trade off in opposite directions below 90° but
                  together above it — consistent with the quantity Hₖ ={" "}
                  √(1−e²)·cos(I) flipping sign at 90°.
                </li>
                <li>
                  Eccentricity and inclination keep inducing each other, so most
                  binary systems are too variable for a stable climate; the
                  steadier ones have low eccentricity and tilt but high mass and
                  orbit ratios.
                </li>
              </ul>
            </Writeup>
          </article>
        </>
      ) : (
        <section>
          <p className="text-zinc-500 text-sm mb-4">
            Full paper rendered below (equations and figures included). It may
            take a moment to load.
          </p>
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-white">
            <iframe
              src={PAPER}
              title="CR3BP paper"
              className="w-full"
              style={{ height: "80vh" }}
            />
          </div>
        </section>
      )}
    </main>
  );
}

function Legend() {
  const items: [string, React.ReactNode][] = [
    ["Heavier body", <Dot key="s" className="bg-amber-300" />],
    ["Lighter body", <Dot key="p" className="bg-sky-300" />],
    ["Stable point", <Dot key="st" className="bg-emerald-400" />],
    ["Unstable point", <Dot key="un" className="bg-amber-400" />],
    ["Satellite", <Dot key="sa" className="bg-white" />],
    [
      "Gravity landscape",
      <span
        key="f"
        className="h-3 w-6 rounded-sm"
        style={{ background: "linear-gradient(90deg,#2e1065,#7c3aed,#db2777)" }}
      />,
    ],
  ];
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-400">
      {items.map(([label, swatch]) => (
        <span key={label} className="inline-flex items-center gap-2">
          {swatch}
          {label}
        </span>
      ))}
    </div>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={`h-2.5 w-2.5 rounded-full ${className}`} />;
}

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
      <div className="font-display font-semibold text-zinc-200 mb-1">{title}</div>
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}

function Writeup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-2xl font-bold text-zinc-100 mb-4">
        {title}
      </h2>
      <div className="prose prose-invert max-w-none prose-p:text-zinc-400 prose-p:leading-relaxed prose-li:text-zinc-400 prose-li:leading-relaxed prose-strong:text-zinc-200 prose-li:my-2">
        {children}
      </div>
    </section>
  );
}
