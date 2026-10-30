import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, Theme } from "@carbon/react";
import "@/i18n";
import "@/styles/globals.scss";
import type { ContestParticipant } from "@/core/entities/contest.entity";
import type { LiveSource } from "@/core/entities/liveMonitoring.entity";
import type { LiveTransport } from "@/infrastructure/realtime/livekitTransport";
import ProctorMonitorGrid from "@/features/contest/screens/admin/panels/ProctorMonitorGrid";

// Synthetic tracks exercise actual video playback and Carbon layout without a server.
const streams = new Map<LiveSource, MediaStream>();
for (const source of ["screen_share", "webcam"] as const) {
  const canvas = document.createElement("canvas");
  canvas.width = source === "webcam" ? 320 : 1280;
  canvas.height = source === "webcam" ? 240 : 720;
  const context = canvas.getContext("2d")!;
  const draw = () => {
    context.fillStyle = source === "webcam" ? "#165c44" : "#16365c";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "white";
    context.font = "24px sans-serif";
    context.fillText(source, 24, 48);
  };
  draw();
  streams.set(source, canvas.captureStream(5));
  window.setInterval(draw, 200);
}
const transport: LiveTransport = {
  connect: async () => {}, publishSources: async () => {}, close: async () => {},
  selectTarget: () => {}, selectTargets: () => {}, bindVideo: () => {}, onState: () => () => {},
  bindTargetVideo: (_identity, source, element) => {
    if (element) element.srcObject = streams.get(source)!;
  },
};
const participants = Array.from({ length: 14 }, (_, index) => ({
  userId: String(index), username: `Student ${String(index).padStart(2, "0")}`,
  displayName: `Student ${String(index).padStart(2, "0")}`, violationCount: 0,
} as ContestParticipant));

function Fixture() {
  const size = new URLSearchParams(location.search).get("size") === "9" ? 9 : 4;
  const [sharing, setSharing] = useState(true);
  const [page, setPage] = useState(0);
  return <Theme theme="white">
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <Button onClick={() => setSharing(!sharing)}>Toggle sharing</Button>
      <ProctorMonitorGrid participants={participants} snapshot={{ stale: false, observedAt: null,
        targets: sharing ? participants.slice(4).map(row => ({ userId: row.userId,
          identity: row.userId, sources: ["screen_share", "webcam"] })) : [],
      }} transport={transport} state="connected" size={size} page={page}
        onPageChange={setPage} onFocus={() => {}} />
    </div>
  </Theme>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
