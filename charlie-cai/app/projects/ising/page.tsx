import type { Metadata } from "next";
import IsingProject from "@/components/IsingProject";

export const metadata: Metadata = {
  title: "Ising Model — Charlie Cai",
  description:
    "An interactive visualization of the Ising model — spins, temperature, and the order-to-disorder phase transition in 1D and 2D.",
};

export default function IsingPage() {
  return <IsingProject />;
}
