import StarfieldPlasma from "@/components/StarfieldPlasma";

export default function Home() {
  return (
    <main className="relative min-h-screen">
      {/* Shuttle view pane: starfield with relativistic flight, the three
          section beacons as sky waypoints, the nameplate, the flight HUD,
          and the electric cursor. */}
      <StarfieldPlasma />
    </main>
  );
}
