import Link from "next/link";
import Image from "next/image";
import { getPostsByType, getRenderedPosts, formatDate } from "@/lib/posts";

export default function WritingPage() {
  const essays = getPostsByType("essay");
  const thoughts = getRenderedPosts("thought");

  return (
    <main className="max-w-3xl mx-auto px-8 pt-32 pb-24">
      <h1 className="font-display text-4xl font-bold tracking-tight text-zinc-100 mb-3">
        Writing
      </h1>
      <p className="text-zinc-400 mb-16">Essays, notes, and short thoughts.</p>

      {/* Essays — each links to its own page */}
      <section className="mb-20">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-8">
          Essays
        </h2>

        {essays.length === 0 ? (
          <p className="text-zinc-600 italic text-sm">No essays yet.</p>
        ) : (
          <ul className="space-y-10">
            {essays.map((post) => (
              <li key={post.slug}>
                <Link href={`/writing/${post.slug}`} className="group block">
                  {post.cover && (
                    <div className="relative aspect-[40/21] mb-4 overflow-hidden rounded-lg border border-zinc-800">
                      <Image
                        src={post.cover}
                        alt=""
                        fill
                        sizes="(max-width: 768px) 100vw, 768px"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  )}
                  <time className="text-xs text-zinc-500">
                    {formatDate(post.date)}
                  </time>
                  <h3 className="font-display text-2xl font-semibold text-zinc-100 mt-1 group-hover:text-violet-400 transition-colors">
                    {post.title}
                  </h3>
                  {post.excerpt && (
                    <p className="text-zinc-400 mt-2 leading-relaxed">
                      {post.excerpt}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Short thoughts — shown in full, inline */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-8">
          Short Thoughts
        </h2>

        {thoughts.length === 0 ? (
          <p className="text-zinc-600 italic text-sm">No short thoughts yet.</p>
        ) : (
          <ul className="space-y-10">
            {thoughts.map((t) => (
              <li
                key={t.slug}
                className="border-l-2 border-zinc-800 pl-5"
              >
                <time className="text-xs text-zinc-500">
                  {formatDate(t.date)}
                </time>
                <div
                  className="prose prose-invert prose-sm max-w-none mt-2 prose-p:text-zinc-300"
                  dangerouslySetInnerHTML={{ __html: t.html }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
