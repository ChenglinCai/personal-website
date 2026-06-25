// Your projects & research. This is a plain data file — to add a project,
// copy one block and edit the fields. Put images in /public/images.

export interface Project {
  title: string;
  description: string;
  image: string; // path under /public, e.g. "/images/my-project.png"
  page?: string; // internal page on this site, e.g. "/projects/cr3bp"
  href?: string; // external link (GitHub, paper, demo) — used if no `page`
  tags: string[];
  year: string;
}

export const projects: Project[] = [
  {
    title: "The Three-Body Problem",
    description:
      "Research on the stability of Lagrange points and the generalization of three-body motion to binary star systems — with a live, interactive simulator.",
    image: "/images/cr3bp.png",
    page: "/projects/cr3bp",
    tags: ["Astrophysics", "Simulation", "Python"],
    year: "2023",
  },
  {
    title: "The Ising Model",
    description:
      "A simple, interactive visualization of how tiny magnets fall into order — and the phase transition that appears in 2D but not in 1D.",
    image: "/images/ising.png",
    page: "/projects/ising",
    tags: ["Statistical Physics", "Simulation"],
    year: "2023",
  },
  {
    title: "Pancake Rotation",
    description:
      "Why a swarm of balls in a stirred dish co-rotates with the stirring — then reverses to counter-rotate once it jams. Interactive granular simulation and theory.",
    image: "/images/pancake.png",
    page: "/projects/pancake",
    tags: ["Granular Physics", "Simulation"],
    year: "2022",
  },
];
