import type { Metadata } from "next";
import PancakeProject from "@/components/PancakeProject";

export const metadata: Metadata = {
  title: "Pancake Rotation — Charlie Cai",
  description:
    "Interactive simulation and theory of swirled granular media (IYPT Q15): why a swarm of balls in a stirred dish co-rotates, then counter-rotates as it jams.",
};

export default function PancakePage() {
  return <PancakeProject />;
}
