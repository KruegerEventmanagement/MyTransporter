import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const { fontFamily: heading } = loadFont("normal", { weights: ["700"], subsets: ["latin"] });
const { fontFamily: body } = loadInter("normal", { weights: ["400", "600"], subsets: ["latin"] });

const DocCard = ({ label, frame, startFrame, fps }: { label: string; frame: number; startFrame: number; fps: number }) => {
  const localFrame = frame - startFrame;
  const cardScale = spring({ frame: localFrame, fps, config: { damping: 14 } });
  // Swipe left-right for authenticity check
  const rotateY = localFrame > 20 ? interpolate(localFrame, [20, 35, 50, 65], [-15, 15, -10, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const checkOp = interpolate(localFrame, [60, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{ transform: `scale(${Math.max(0, cardScale)}) perspective(800px) rotateY(${rotateY}deg)`, textAlign: "center" }}>
      <div style={{
        width: 320, height: 200, borderRadius: 16, background: "linear-gradient(135deg, #334155, #475569)",
        border: "2px solid #475569", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ fontFamily: body, fontSize: 14, color: "#94a3b8", marginBottom: 8 }}>{label}</div>
        <div style={{ width: 200, height: 20, background: "#1e293b", borderRadius: 4, marginBottom: 8 }} />
        <div style={{ width: 160, height: 14, background: "#1e293b", borderRadius: 4, marginBottom: 6 }} />
        <div style={{ width: 120, height: 14, background: "#1e293b", borderRadius: 4 }} />
        {/* Scan line */}
        {localFrame > 5 && localFrame < 55 && (
          <div style={{
            position: "absolute", left: 0, right: 0, height: 3, background: "#38bdf8",
            top: `${interpolate(localFrame, [5, 55], [10, 90], { extrapolateRight: "clamp" })}%`,
            boxShadow: "0 0 12px #38bdf8",
          }} />
        )}
      </div>
      {checkOp > 0 && (
        <div style={{ opacity: checkOp, marginTop: 12, fontFamily: body, fontSize: 16, color: "#4ade80", fontWeight: 600 }}>
          ✓ Verifiziert
        </div>
      )}
    </div>
  );
};

export const SceneDocScan = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: titleOp, fontFamily: heading, fontSize: 44, color: "#f8fafc", marginBottom: 40, textAlign: "center" }}>
        Dokumente scannen & verifizieren
      </div>
      <div style={{ display: "flex", gap: 40 }}>
        <DocCard label="Führerschein" frame={frame} startFrame={10} fps={fps} />
        <DocCard label="Personalausweis" frame={frame} startFrame={30} fps={fps} />
      </div>
      <div style={{ fontFamily: body, fontSize: 16, color: "#64748b", marginTop: 30, opacity: interpolate(frame, [70, 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        Vorder- & Rückseite · Links-Rechts-Schwenk zur Echtheitsprüfung
      </div>
    </AbsoluteFill>
  );
};
