import Image from "next/image";

export default function AboutPage() {
  return (
    <main className="max-w-3xl mx-auto px-8 pt-32 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center gap-8 mb-12">
        <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-full border border-zinc-800">
          <Image
            src="/images/portrait.png"
            alt="Charlie Cai"
            fill
            sizes="128px"
            className="object-cover"
          />
        </div>
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-zinc-100 mb-2">
            About
          </h1>
          <p className="text-zinc-400">A little about who I am.</p>
        </div>
      </div>

      <section className="space-y-5 text-zinc-300 leading-relaxed">
        <p>
          This is a sample bio — replace it with your own. I&apos;m Charlie Cai,
          a student at Penn interested in writing, building software, and
          research.
        </p>
        <p className="text-zinc-600 italic text-sm">
          Edit this page at app/about/page.tsx, and swap the photo by replacing
          public/images/portrait.png.
        </p>
      </section>
    </main>
  );
}
