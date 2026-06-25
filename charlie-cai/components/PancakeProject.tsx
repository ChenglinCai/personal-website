"use client";

import { useState } from "react";
import Link from "next/link";
import PancakeSimulator from "@/components/PancakeSimulator";
import { InlineMath, BlockMath } from "@/components/Math";

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
              The view defaults to the <strong className="text-zinc-200">Lab frame</strong> —
              what you actually see: the dish centre (red dot) orbits the swirl axis
              while the dish itself never spins. The{" "}
              <span className="text-amber-300">amber dot</span> is a point painted on
              the dish rim, so it keeps a fixed orientation here and only sweeps
              around in the M-frame. Switch to the{" "}
              <strong className="text-zinc-200">M-frame</strong> — the frame
              co-rotating with the swirl, in which the dish stands still and the
              system settles into a steady state — or the{" "}
              <strong className="text-zinc-200">Dish frame</strong>, which follows
              the dish centre without rotating with it (the wall is then a fixed
              circle and you can watch the cluster slosh and pile toward the far
              side). Each ball spins on its own axis (the dark tick) and
              the whole swarm rotates about its centre of mass — the{" "}
              <strong className="text-zinc-200">white dot</strong>. The readout
              shows the lab-frame rotation Ω: at low{" "}
              <strong className="text-zinc-200">N</strong> it is{" "}
              <span className="text-emerald-400">green (co-rotating)</span>; raise{" "}
              N past the jamming point and it tips{" "}
              <span className="text-orange-400">orange (counter-rotating)</span>.
              Use <strong className="text-zinc-200">Plot Ω vs N</strong> to trace
              the whole transition.
            </p>

            <PancakeSimulator />

            <div className="mt-8 grid gap-4 sm:grid-cols-3 text-sm text-zinc-400">
              <Tip title="Few balls: co-rotation">
                A loose cluster lets each wall ball roll and spin freely, acting as
                a bearing. The pack slips on the wall and is carried gently the
                same way you stir.
              </Tip>
              <Tip title="Many balls: counter-rotation">
                Dense packing frustrates the balls&apos; spins, so they can no
                longer roll — the cluster sticks to the wall (no-slip) and
                treadmills around its rim, which forces it to spin backwards.
              </Tip>
              <Tip title="Both frictions are essential">
                Set wall friction <em>or</em> ball–ball friction to zero and the
                transition vanishes — the swarm just co-rotates at every N, exactly
                as the experiments found.
              </Tip>
            </div>
          </section>

          <p className="mt-8 max-w-3xl text-xs text-zinc-600 leading-relaxed">
            The engine follows Lee&nbsp;et&nbsp;al., <em>Phys. Rev. E</em>{" "}
            <strong className="text-zinc-500">100</strong>, 012903 (2019):
            frictionless floor, elastic normal collisions, a Coulomb-friction
            tangential impulse with a Wang–Mason stick clamp, and the same disc
            moment of inertia (I = 10). It integrates in the M-frame with explicit
            centrifugal and Coriolis forces, so even small clusters settle against
            the wall and reach steady state. Run live, it reproduces the paper&apos;s
            headline results: a co→counter transition with N, an earlier transition
            at higher friction, and — the decisive test — <em>no</em> counter-rotation
            when either friction is switched off. (A small restitution replaces the
            paper&apos;s exact event-driven scheme for real-time stability.)
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
              The trick that makes the problem tractable — due to Lee et al. — is to
              ride along in the frame that rotates with the swirl (the{" "}
              <strong className="text-zinc-200">M-frame</strong>). A body that
              doesn&apos;t rotate in the lab rotates at −ω in this frame, so the
              container&apos;s wall sweeps around its own centre at a constant{" "}
              <InlineMath>{String.raw`-\omega`}</InlineMath>. Two fictitious forces
              appear: a <strong className="text-zinc-200">centrifugal</strong> force{" "}
              <InlineMath>{String.raw`\omega^2\mathbf{x}`}</InlineMath> that points
              outward from the swirl axis, and a{" "}
              <strong className="text-zinc-200">Coriolis</strong> force{" "}
              <InlineMath>{String.raw`2\,\mathbf{v}\times\boldsymbol{\omega}`}</InlineMath>{" "}
              perpendicular to each ball&apos;s velocity.
            </p>
            <p>
              This is the key to everything. The centrifugal force plays the role of
              gravity in a <em>rotating drum</em>: it pins the balls into a compact
              cluster against the wall, where the moving wall then drags them along
              before they avalanche back through the interior. Because these forces
              are steady in the M-frame, the swarm reaches a genuine{" "}
              <strong className="text-zinc-200">statistical steady state</strong> —
              which it never does in the lab frame, where it just sloshes. The
              simulation here integrates the real equations of motion in exactly
              this frame, which is why even a handful of balls settle against the
              wall instead of sitting inertly at the centre.
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
              friction</strong> impulse acts, proportional to the normal impulse{" "}
              <InlineMath>{String.raw`J_n`}</InlineMath> but capped by the impulse
              that would make the contact stop sliding:
            </p>
            <BlockMath>
              {String.raw`J_t = -\operatorname{sgn}(v_{\mathrm{rel}})\,\min\!\left(\mu J_n,\ \frac{|v_{\mathrm{rel}}|}{\dfrac{1}{m_i}+\dfrac{1}{m_j}+\dfrac{r^2}{I_i}+\dfrac{r^2}{I_j}}\right)`}
            </BlockMath>
            <p>
              where{" "}
              <InlineMath>{String.raw`v_{\mathrm{rel}} = v_j^{\,t} - v_i^{\,t} + r(\omega_i + \omega_j)`}</InlineMath>{" "}
              is the relative surface velocity at the contact. This single rule couples the
              balls&apos; <em>translation</em> to their <em>spin</em>: every rub
              both nudges a ball sideways and changes how fast it twirls. For the
              wall the same law applies, but with the container&apos;s mass and
              moment of inertia taken to infinity, so only the ball&apos;s state
              changes.
            </p>
          </Writeup>

          <Writeup title="The minimal model: one ball and a slip parameter">
            <p>
              Before the crowd, consider a single rigid ball of radius{" "}
              <em>r</em> in the swirled dish of radius <em>R</em>. In the M-frame it
              settles near the bottom of the wall and rolls along it at some spin{" "}
              <InlineMath>{String.raw`\Omega_b`}</InlineMath>. Everything hinges on
              how much it <strong className="text-zinc-200">slips</strong> against
              the wall.
            </p>
            <p>
              With <strong className="text-zinc-200">perfect slip</strong> (no
              friction) the wall can&apos;t turn the ball at all:{" "}
              <InlineMath>{String.raw`\Omega_b = 0`}</InlineMath>, and in the lab
              frame the ball simply co-rotates with the swirl. With{" "}
              <strong className="text-zinc-200">perfect no-slip</strong> (strong
              friction) the ball rolls commensurately, like one gear inside another,
              at <InlineMath>{String.raw`\Omega_b = (R/r)\,\omega`}</InlineMath> —
              fast enough that, back in the lab frame, it{" "}
              <em>counter-rotates</em>. Defining the slip parameter
            </p>
            <BlockMath>{String.raw`s = \frac{\Omega_M}{\omega}\cdot\frac{r}{R}`}</BlockMath>
            <p>
              the system rotates with the swirl when s ≈ 0 and against it when
              s ≈ 1. The whole phenomenon is the story of how a <em>crowd</em> of
              balls moves this single number from 0 toward 1.
            </p>
          </Writeup>

          <Writeup title="Why the direction flips: geometric frustration">
            <p>
              <strong className="text-zinc-200">Few balls → slip → co-rotation.</strong>{" "}
              In a loose cluster, each ball at the wall is free to roll and spin on
              its own. Those spinning balls act like ball-bearings: the cluster
              lags well behind the moving wall (s ≪ 1), so in the lab frame it is
              gently carried along <em>with</em> the swirl.
            </p>
            <p>
              <strong className="text-zinc-200">
                Many balls → frustration → counter-rotation.
              </strong>{" "}
              Pack the balls densely and friction between neighbours dominates. Two
              touching balls that rub must try to spin in <em>opposite</em>
              senses — an antiferromagnetic-like rule — and in the six-fold packing
              of a dense cluster these demands cannot all be satisfied at once. This{" "}
              <strong className="text-zinc-200">geometric frustration</strong> locks
              the balls: none can roll or spin freely. Unable to act as bearings,
              the cluster sticks to the wall (s → 1) and treadmills around its rim
              as a rigid pancake — which, like a coin rolling inside a larger ring,
              forces it to turn <em>backwards</em>. Both frictions are needed:
              ball–ball friction to rigidify the pack, wall friction to make the
              rigid pack roll.
            </p>
          </Writeup>

          <Writeup title="The transition and what sets it">
            <p>
              So <InlineMath>{String.raw`\Omega(N)`}</InlineMath> starts positive,
              falls as the cluster stiffens, and crosses zero at a critical number{" "}
              <strong className="text-zinc-200">
                <InlineMath>{String.raw`N_c`}</InlineMath>
              </strong>{" "}
              where the slip parameter passes through the value that exactly cancels
              the swirl. Beyond <InlineMath>{String.raw`N_c`}</InlineMath> the swarm
              counter-rotates; at the very
              highest densities the magnitude even eases back slightly, just as the
              experiments report.
            </p>
            <p>
              The picture predicts the right knobs, and the interactive sweep bears
              them out: stronger friction reaches no-slip sooner, so{" "}
              <InlineMath>{String.raw`N_c`}</InlineMath> <em>falls</em> (roughened
              beads in the experiment flip at N≈28 versus ≈36 for smooth ones); a
              larger dish-to-ball ratio gives more room before jamming, so{" "}
              <InlineMath>{String.raw`N_c`}</InlineMath> <em>rises</em>; and removing
              either
              friction prevents no-slip altogether, so the transition disappears and
              the swarm co-rotates at every N.
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
