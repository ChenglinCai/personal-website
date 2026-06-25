// Reads your Markdown writing from /content/writing and turns it into data the
// pages can render. Runs on the server only (it touches the filesystem).
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

const WRITING_DIR = path.join(process.cwd(), "content", "writing");

export type PostType = "essay" | "thought";

// The "header" info at the top of each .md file.
export interface PostMeta {
  slug: string; // filename without .md — also the URL
  title: string;
  date: string; // ISO string
  type: PostType;
  excerpt: string;
  cover?: string; // optional image path under /public
}

// A full post, including its rendered HTML body.
export interface Post extends PostMeta {
  html: string;
}

function readFile(file: string): { meta: PostMeta; content: string } {
  const raw = fs.readFileSync(path.join(WRITING_DIR, file), "utf8");
  const { data, content } = matter(raw);
  const meta: PostMeta = {
    slug: file.replace(/\.md$/, ""),
    title: typeof data.title === "string" ? data.title : "Untitled",
    date: data.date
      ? new Date(data.date).toISOString()
      : new Date().toISOString(),
    type: data.type === "thought" ? "thought" : "essay",
    excerpt: typeof data.excerpt === "string" ? data.excerpt : "",
    cover: typeof data.cover === "string" ? data.cover : undefined,
  };
  return { meta, content };
}

// All posts, newest first.
export function getAllPosts(): PostMeta[] {
  if (!fs.existsSync(WRITING_DIR)) return [];
  return fs
    .readdirSync(WRITING_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => readFile(f).meta)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPostsByType(type: PostType): PostMeta[] {
  return getAllPosts().filter((p) => p.type === type);
}

// Full posts (with rendered HTML) of one type — used to show thoughts inline.
export function getRenderedPosts(type: PostType): Post[] {
  return getPostsByType(type)
    .map((m) => getPost(m.slug))
    .filter((p): p is Post => p !== null);
}

// One post by slug, with its Markdown converted to HTML.
export function getPost(slug: string): Post | null {
  const full = path.join(WRITING_DIR, `${slug}.md`);
  if (!fs.existsSync(full)) return null;
  const { meta, content } = readFile(`${slug}.md`);
  const html = marked.parse(content, { async: false }) as string;
  return { ...meta, html };
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
