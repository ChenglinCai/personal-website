import Link from "next/link";
import IsingSimulator from "@/components/IsingSimulator";

const REPO = "https://github.com/ChenglinCai/Ising-Model";

export default function IsingProject() {
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
          Statistical Physics
        </p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-zinc-100 leading-tight">
          The Ising Model
        </h1>

        <p className="text-zinc-300 mt-6 max-w-3xl leading-relaxed text-lg">
          A very simple, very cool visualization. Imagine a grid of tiny magnets,
          each one pointing either up or down. Every magnet would rather match its
          neighbours — but heat keeps jostling them out of line. Turn the
          temperature down and they fall into step; turn it up and they scatter
          into noise.
        </p>
        <p className="text-zinc-400 mt-4 max-w-3xl leading-relaxed">
          That tiny rule — “try to agree with your neighbours” — is enough to
          produce one of the most famous results in physics: a sudden{" "}
          <strong className="text-zinc-200">phase transition</strong> from order
          to chaos at a precise temperature. Drag the slider and switch between
          dimensions to watch it happen live.
        </p>

        <div className="mt-6 text-sm">
          <a
            href={REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:underline"
          >
            Code on GitHub ↗
          </a>
        </div>
      </header>

      <IsingSimulator />

      <div className="mt-8 grid gap-4 sm:grid-cols-3 text-sm text-zinc-400">
        <Tip title="Temperature is the dial">
          Low temperature lets neighbours align into big bright/dark domains; high
          temperature drowns them in random flickering. Hit “Sweep temperature” to
          plot magnetization across the whole range and watch the transition draw
          itself.
        </Tip>
        <Tip title="Dimensions behave differently">
          Order survives below a sharp critical temperature in 2D (Tc ≈ 2.269) and
          3D (Tc ≈ 4.512), but never in 1D (Tc = 0). The 3D cube is drawn as a
          see-through, rotating block so you can look inside — toggle dimensions
          to compare.
        </Tip>
        <Tip title="It&apos;s all one simple rule">
          Each step picks a random spin and flips it with a probability set by
          Boltzmann statistics (the Metropolis algorithm). No global plan — order
          emerges on its own.
        </Tip>
      </div>
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
