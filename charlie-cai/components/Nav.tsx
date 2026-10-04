import Link from "next/link";

const LINKS = [
  { href: "/about", index: "01", label: "About" },
  { href: "/writing", index: "02", label: "Writing" },
  { href: "/projects", index: "03", label: "Projects" },
];

export default function Nav() {
  return (
    <header className="fixed top-0 right-0 left-0 z-50 flex items-center justify-between px-8 py-5">
      <Link
        href="/"
        className="font-display text-[15px] font-bold tracking-tight text-zinc-100 transition-colors hover:text-white"
      >
        Charlie Cai
      </Link>
      <nav className="flex items-center gap-7">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="group flex items-baseline gap-2 font-mono text-[11px] tracking-[0.2em] text-zinc-500 uppercase transition-colors hover:text-zinc-100"
          >
            <span className="text-zinc-600 transition-colors group-hover:text-violet-300">
              {l.index}
            </span>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
