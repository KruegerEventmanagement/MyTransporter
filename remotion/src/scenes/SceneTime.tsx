import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const { fontFamily: heading } = loadFont("normal", { weights: ["700"], subsets: ["latin"] });
const { fontFamily: body } = loadInter("normal", { weights: ["400", "600"], subsets: ["latin"] });

export const SceneTime = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const slotsScale = spring({ frame: frame - 10, fps, config: { damping: 15 } });
  const selectFrame = 45;
  const selectedSlot = frame >= selectFrame ? 4 : -1; // 12:00

  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: titleOp, fontFamily: heading, fontSize: 52, color: "#f8fafc", marginBottom: 40, textAlign: "center" }}>
        Schritt 2: Uhrzeit wählen
      </div>
      <div style={{ transform: `scale(${slotsScale})`, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, maxWidth: 500 }}>
        {hours.map((h, i) => {
          const isSelected = i === selectedSlot;
          const popIn = isSelected ? spring({ frame: frame - selectFrame, fps, config: { damping: 10 } }) : 0;
          return (
            <div key={h} style={{
              padding: "16px 20px", borderRadius: 16, textAlign: "center",
              fontFamily: body, fontSize: 18, fontWeight: 600,
              background: isSelected ? "#38bdf8" : "#334155",
              color: isSelected ? "#0f172a" : "#e2e8f0",
              transform: isSelected ? `scale(${1 + popIn * 0.1})` : undefined,
              boxShadow: isSelected ? "0 8px 30px rgba(56,189,248,0.3)" : undefined,
            }}>
              {h}:00
            </div>
          );
        })}
      </div>
      <div style={{ fontFamily: body, fontSize: 18, color: "#64748b", marginTop: 30, opacity: interpolate(frame, [50, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        Letzte Buchung: 20:00 Uhr
      </div>
    </AbsoluteFill>
  );
};
