"use client";

import { useState } from "react";
import Link from "next/link";
import PancakeSimulator from "@/components/PancakeSimulator";

export default function PancakeProject() {
  const [view, setView] = useState<"simulation" | "theory">("simulation");

  return (
    <main className="max-w-5xl mx-auto px-8 pt-32 pb-24">
      <Link
        href="/projects"
        className="text-sm text-zinc-500 hover:text-violet-400 transition-colors"
      >
        ← Projects
      </Link>

      <header className="mt-8 mb-10">
        <p className="text-violet-300/70 text-xs tracking-[0.25em] uppercase mb-4 font-display">
          Granular Physics · IYPT
        </p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-zinc-100 leading-tight">
          Pancake Rotation
        </h1>

        <p className="text-zinc-300 mt-6 max-w-3xl leading-relaxed text-lg">
          Put a handful of balls in a shallow round dish and stir the dish in
          small circles — without spinning it, just sliding it around. The balls
          gather into a clump that slowly rotates. The surprise: with a few balls
          the clump turns the <em>same</em> way you stir, but pack in enough balls
          and it turns the <em>opposite</em> way.
        </p>
        <p className="text-zinc-400 mt-4 max-w-3xl leading-relaxed">
          This is IYPT Problem 15. Below you can stir the dish yourself and find
          the tipping point, or read the theory of why a crowd of balls reverses
          direction.
        </p>
      </header>

      <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/50 p-1 mb-10">
        {(["simulation", "theory"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-5 py-2 text-sm font-medium capitalize transition-colors ${
              view === v
                ? "bg-violet-500/20 text-violet-200"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {v === "simulation" ? "Interactive simulation" : "Read the theory"}
          </button>
        ))}
      </div>

      {view === "simulation" ? (
        <>
          <section>
            <p className="text-zinc-400 text-sm mb-6 max-w-3xl leading-relaxed">
              The dish (its centre marked by the amber stick, which points the way
              it&apos;s being stirred) is swirled in a small circle. Each ball
              spins on its own axis (the dark tick) and the whole swarm slowly
              rotates about its centre of mass — the{" "}
              <strong className="text-zinc-200">white dot</strong>. Watch the
              readout: at low{" "}
              <strong className="text-zinc-200">N</strong> the swarm rotation is{" "}
              <span className="text-emerald-400">green (co-rotating)</span>; raise{" "}
              N past the jamming point and it turns{" "}
              <span className="text-orange-400">orange (counter-rotating)</span>.
              Or hit <strong className="text-zinc-200">Sweep N</strong> to plot the
              whole transition.
            </p>

            <PancakeSimulator />

            <div className="mt-8 grid gap-4 sm:grid-cols-3 text-sm text-zinc-400">
              <Tip title="Few balls: co-rotation">
                Loosely packed balls are simply dragged along by friction with the
                moving wall, so the swarm drifts the same way you stir.
              </Tip>
              <Tip title="Many balls: counter-rotation">
                Once the balls jam into a rigid pancake, the wall rolls around its
                rim instead of dragging it — and a disc with something rolling
                around its edge spins backwards.
              </Tip>
              <Tip title="Friction sets the balance">
                Wall friction drives co-rotation; ball–ball friction stiffens the
                pack. Slide both to move the tipping point.
              </Tip>
            </div>
          </section>

          <p className="mt-8 max-w-3xl text-xs text-zinc-600 leading-relaxed">
            The simulation runs the same physics as the research code, rebuilt and
            corrected: elastic normal collisions with a Coulomb-friction
            tangential impulse (and a stick limit), a properly swirled wall, and
            the swarm&apos;s rotation measured about its own centre of mass. The
            original notebook never integrated to a solution; this one does, in
            your browser.
          </p>
        </>
      ) : (
        <article className="max-w-3xl space-y-16">
          <Writeup title="The setup">
            <p>
              A shallow circular container of radius{" "}
              <em>R</em> holds <em>N</em> identical balls (radius <em>r</em>). The
              container is <strong className="text-zinc-200">swirled</strong>: its
              centre is moved around a small circle of radius <em>A</em> at angular
              frequency <em>ω</em>, but the container itself never spins. Because
              the floor is effectively frictionless, the balls feel no driving
              force except through <em>collisions</em> — with each other and with
              the wall. The question is why the swarm acquires a net spin at all,
              and why its direction depends on how many balls there are.
            </p>
          </Writeup>

          <Writeup title="The swirled frame">
            <p>
              It helps to ride along in the frame that rotates with the swirl (the
              “M-frame”). A body that doesn&apos;t rotate in the lab rotates at −ω
              in this frame, so the container&apos;s wall sweeps around at constant
              −ω. Two fictitious forces appear — Coriolis (2 v×ω) and centrifugal
              (ω×(x×ω)). The centrifugal term pushes the balls outward into a
              packed cluster against one side of the wall; the Coriolis term is
              what ultimately biases the cluster&apos;s spin one way or the other.
            </p>
          </Writeup>

          <Writeup title="The collision law">
            <p>
              Between collisions the balls coast freely. A collision is split into
              a normal direction (along the line of centres, n̂) and a tangential
              direction (t̂). Normal impacts are taken as{" "}
              <strong className="text-zinc-200">elastic</strong>, so for equal
              masses the balls simply exchange their normal velocities. The
              tangential direction carries the interesting physics: surfaces in
              contact rub, so a <strong className="text-zinc-200">Coulomb
              friction</strong> impulse acts, proportional to the normal impulse
              <em> J</em>
              <sub>n</sub> but capped by the impulse that would make the contact
              stop sliding:
            </p>
            <p className="text-zinc-300">
              J<sub>t</sub> = −sgn(v<sub>rel</sub>) · min( μ J<sub>n</sub>, |v
              <sub>rel</sub>| / (1/m<sub>i</sub> + 1/m<sub>j</sub> + r²/I
              <sub>i</sub> + r²/I<sub>j</sub>) ),
            </p>
            <p>
              where v<sub>rel</sub> = v<sub>j</sub>
              <sup>t</sup> − v<sub>i</sub>
              <sup>t</sup> + r(ω<sub>i</sub> + ω<sub>j</sub>) is the relative
              surface velocity at the contact. This single rule couples the
              balls&apos; <em>translation</em> to their <em>spin</em>: every rub
              both nudges a ball sideways and changes how fast it twirls. For the
              wall the same law applies, but with the container&apos;s mass and
              moment of inertia taken to infinity, so only the ball&apos;s state
              changes.
            </p>
          </Writeup>

          <Writeup title="Why the direction flips">
            <p>
              The net rotation is a competition between two opposite tendencies.
            </p>
            <p>
              <strong className="text-zinc-200">Boundary drag → co-rotation.</strong>{" "}
              When the balls are sparse, the swirling wall slides past them and
              friction simply drags whatever balls it touches along with it. The
              loose swarm is towed around in the direction of the swirl.
            </p>
            <p>
              <strong className="text-zinc-200">
                Geometric frustration → counter-rotation.
              </strong>{" "}
              When enough balls are present they jam into a rigid, close-packed
              pancake that can no longer rearrange. Now the wall can&apos;t drag the
              pack <em>through</em> itself; instead it <em>rolls around its rim</em>.
              A disc with a ring rolling around its outside is forced to spin{" "}
              <em>backwards</em> — the same reason a coin rolling inside a larger
              ring traces a hypocycloid and turns against the orbit. So the jammed
              swarm counter-rotates.
            </p>
            <p>
              A minimal estimate makes this concrete. Treat the jammed swarm as one
              rigid disc of radius <em>a</em>(N) rolling without slipping against
              the wall sweeping at −ω. Matching contact speeds gives a swarm spin
              of order Ω ≈ −ω · (R − a)/a in the M-frame: negative, i.e. opposed to
              the swirl, and larger when the pack fills more of the dish. Finite
              friction allows some slip, which softens the magnitude but not the
              sign.
            </p>
          </Writeup>

          <Writeup title="The transition and what sets it">
            <p>
              Writing the net rotation as the sum of a co-rotating drag term that
              dominates when balls are loose and a counter-rotating rolling term
              that grows as the pack stiffens, Ω(N) starts positive, decreases as N
              rises, and crosses zero at a critical number{" "}
              <strong className="text-zinc-200">N<sub>c</sub></strong> — the point
              where the pack becomes rigid enough to roll rather than be dragged.
              The model predicts the sensible trends: N<sub>c</sub> rises with the
              container-to-ball size ratio (more room before jamming) and with the
              swirl speed (stronger drag), and falls with stronger friction (the
              pack stiffens sooner). The interactive sweep reproduces exactly this
              curve — co-rotation at small N, a sign change near the jamming
              density, and counter-rotation beyond it.
            </p>
          </Writeup>
        </article>
      )}
    </main>
  );
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
      <h2 className="font-display text-2xl font-bold text-zinc-100 mb-4">{title}</h2>
      <div className="prose prose-invert max-w-none prose-p:text-zinc-400 prose-p:leading-relaxed prose-strong:text-zinc-200">
        {children}
      </div>
    </section>
  );
}
