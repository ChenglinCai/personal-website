import katex from "katex";
import "katex/dist/katex.min.css";

// Lightweight KaTeX wrappers. We render to an HTML string (katex.renderToString
// is pure) and inject it, which avoids any React-version peer-dependency issues.

export function InlineMath({ children }: { children: string }) {
  const html = katex.renderToString(children, {
    throwOnError: false,
    displayMode: false,
  });
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function BlockMath({ children }: { children: string }) {
  const html = katex.renderToString(children, {
    throwOnError: false,
    displayMode: true,
  });
  return (
    <span
      className="my-3 block overflow-x-auto text-zinc-200"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
