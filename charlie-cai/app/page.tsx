import StarfieldPlasma from "@/components/StarfieldPlasma";
import Link from "next/link";

export default function Home() {
  return (
    <main className="relative min-h-screen flex items-center justify-center px-8">
      {/* Animated starfield + plasma cursor trail, painted on a canvas */}
      <StarfieldPlasma />

      {/* Hero content sits above the canvas (z-20 > canvas z-0) */}
      <div className="relative z-20 max-w-2xl w-full">
        <p className="text-violet-300/70 text-xs tracking-[0.35em] uppercase mb-6 font-display">
          Hi, I&apos;m
        </p>

        <h1 className="font-cosmic text-6xl sm:text-7xl font-extrabold uppercase text-zinc-50 mb-6 leading-tight">
          Charlie Cai
        </h1>

        <p className="text-lg text-zinc-400 leading-relaxed mb-10 max-w-lg">
          
          I share my thoughts, research and work here.
        </p>

        <div className="flex gap-8">
          <Link
            href="/about"
            className="group flex items-center gap-2 text-zinc-300 hover:text-violet-400 transition-colors"
          >
            About
            <span className="text-zinc-600 group-hover:text-violet-400 transition-colors">
              →
            </span>
          </Link>
          <Link
            href="/writing"
            className="group flex items-center gap-2 text-zinc-300 hover:text-violet-400 transition-colors"
          >
            Writing
            <span className="text-zinc-600 group-hover:text-violet-400 transition-colors">
              →
            </span>
          </Link>
          <Link
            href="/projects"
            className="group flex items-center gap-2 text-zinc-300 hover:text-violet-400 transition-colors"
          >
            Projects
            <span className="text-zinc-600 group-hover:text-violet-400 transition-colors">
              →
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}
