import Image from "next/image";
import Link from "next/link";
import { projects, type Project, type ProjectPiece } from "@/lib/projects";

function ProjectCard({ project }: { project: Project | ProjectPiece }) {
  const Card = (
    <>
      {project.image && (
        <div className="relative aspect-[3/2] overflow-hidden rounded-lg border border-zinc-800">
          <Image
            src={project.image}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 400px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      )}
      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-xl font-semibold text-zinc-100 group-hover:text-violet-400 transition-colors">
            {project.title}
          </h3>
          {project.year && (
            <span className="text-xs text-zinc-500 shrink-0">{project.year}</span>
          )}
        </div>
        <p className="text-zinc-400 mt-2 leading-relaxed text-sm">{project.description}</p>
        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs text-violet-300/80 bg-violet-500/10 border border-violet-500/20 rounded-full px-3 py-1"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );

  if (project.page) {
    return (
      <Link href={project.page} className="group block">
        {Card}
      </Link>
    );
  }
  if ("href" in project && project.href) {
    return (
      <a href={project.href} target="_blank" rel="noopener noreferrer" className="group block">
        {Card}
      </a>
    );
  }
  return <div className="group block">{Card}</div>;
}

export default function ProjectsPage() {
  return (
    <main className="max-w-4xl mx-auto px-8 pt-32 pb-24">
      <h1 className="font-display text-4xl font-bold tracking-tight text-zinc-100 mb-3">
        Projects
      </h1>
      <p className="text-zinc-400 mb-16">
        More advanced projects will be linked here on their own.
      </p>

      {projects.length === 0 ? (
        <p className="text-zinc-600 italic text-sm">Projects coming soon.</p>
      ) : (
        <div className="flex flex-col gap-16">
          {projects.map((project) =>
            project.pieces ? (
              <section key={project.title}>
                <h2 className="font-display text-2xl font-semibold tracking-tight text-zinc-100">
                  {project.title}
                </h2>
                <p className="text-zinc-400 mt-3 max-w-2xl leading-relaxed">
                  {project.description}
                </p>
                <div className="grid gap-8 sm:grid-cols-2 mt-8">
                  {project.pieces.map((piece) => (
                    <ProjectCard key={piece.title} project={piece} />
                  ))}
                </div>
              </section>
            ) : (
              <ProjectCard key={project.title} project={project} />
            )
          )}
        </div>
      )}
    </main>
  );
}
