import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const { fontFamily: heading } = loadFont("normal", { weights: ["700"], subsets: ["latin"] });
const { fontFamily: body } = loadInter("normal", { weights: ["400", "600"], subsets: ["latin"] });

export const SceneDate = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleY = interpolate(frame, [0, 20], [-40, 0], { extrapolateRight: "clamp" });
  const titleOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const calScale = spring({ frame: frame - 15, fps, config: { damping: 15, stiffness: 120 } });
  const cursorX = interpolate(frame, [40, 60], [0, 60], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cursorY = interpolate(frame, [40, 60], [0, 40], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const clickScale = frame >= 60 && frame < 70 ? interpolate(frame, [60, 65, 70], [1, 0.9, 1], { extrapolateRight: "clamp" }) : 1;
  const highlightOp = interpolate(frame, [65, 75], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: titleOp, transform: `translateY(${titleY}px)`, fontFamily: heading, fontSize: 52, color: "#f8fafc", marginBottom: 40, textAlign: "center" }}>
        Schritt 1: Datum wählen
      </div>
      <div style={{ transform: `scale(${calScale})`, background: "#1e293b", borderRadius: 24, border: "2px solid #334155", padding: 40, width: 500 }}>
        <div style={{ fontFamily: body, fontSize: 20, color: "#94a3b8", marginBottom: 16, textAlign: "center" }}>Mai 2026</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
          {days.slice(0, 28).map((d) => (
            <div key={d} style={{
              width: 48, height: 48, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: body, fontSize: 18, color: d === 14 ? "#0f172a" : "#e2e8f0",
              background: d === 14 ? (highlightOp > 0.5 ? "#38bdf8" : "#334155") : "#334155",
              transform: d === 14 ? `scale(${clickScale})` : undefined,
            }}>
              {d}
            </div>
          ))}
        </div>
      </div>
      {/* Cursor */}
      <div style={{
        position: "absolute", left: "52%", top: "52%",
        transform: `translate(${cursorX}px, ${cursorY}px)`,
        opacity: interpolate(frame, [35, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M5 3l14 9-7 2-4 7-3-18z"/></svg>
      </div>
    </AbsoluteFill>
  );
};
