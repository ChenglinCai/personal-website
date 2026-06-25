import Link from "next/link";

export default function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5">
      <Link
        href="/"
        className="font-display text-zinc-100 font-bold tracking-tight hover:text-white transition-colors"
      >
        Charlie Cai
      </Link>
      <nav className="flex items-center gap-8">
        <Link
          href="/about"
          className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          About
        </Link>
        <Link
          href="/writing"
          className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          Writing
        </Link>
        <Link
          href="/projects"
          className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          Projects
        </Link>
      </nav>
    </header>
  );
}
