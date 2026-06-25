import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getAllPosts, getPost, formatDate } from "@/lib/posts";

// Pre-build a page for every post at build time (fast + SEO-friendly).
export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <main className="max-w-3xl mx-auto px-8 pt-32 pb-24">
      <Link
        href="/writing"
        className="text-sm text-zinc-500 hover:text-violet-400 transition-colors"
      >
        ← Writing
      </Link>

      <header className="mt-8 mb-10">
        <time className="text-xs text-zinc-500">{formatDate(post.date)}</time>
        <h1 className="font-display text-4xl font-bold tracking-tight text-zinc-100 mt-2 leading-tight">
          {post.title}
        </h1>
      </header>

      {post.cover && (
        <div className="relative aspect-[40/21] mb-12 overflow-hidden rounded-lg border border-zinc-800">
          <Image
            src={post.cover}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
            priority
          />
        </div>
      )}

      <article
        className="prose prose-invert max-w-none prose-headings:font-display prose-a:text-violet-400 prose-a:no-underline hover:prose-a:underline prose-code:text-violet-300"
        dangerouslySetInnerHTML={{ __html: post.html }}
      />
    </main>
  );
}
