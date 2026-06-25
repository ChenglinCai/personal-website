import type { Metadata } from "next";
import CR3BPProject from "@/components/CR3BPProject";

export const metadata: Metadata = {
  title: "Three-Body Problem — Charlie Cai",
  description:
    "Interactive simulator and research paper on the circular restricted three-body problem and the stability of Lagrange points.",
};

export default function CR3BPPage() {
  return <CR3BPProject />;
}
