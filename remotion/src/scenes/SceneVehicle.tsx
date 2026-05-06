import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const { fontFamily: heading } = loadFont("normal", { weights: ["700"], subsets: ["latin"] });
const { fontFamily: body } = loadInter("normal", { weights: ["400", "600"], subsets: ["latin"] });

export const SceneVehicle = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const cardScale = spring({ frame: frame - 10, fps, config: { damping: 14 } });
  const btnOp = interpolate(frame, [60, 75], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const btnPulse = frame > 75 ? 1 + Math.sin((frame - 75) * 0.15) * 0.02 : 1;

  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: titleOp, fontFamily: heading, fontSize: 52, color: "#f8fafc", marginBottom: 40, textAlign: "center" }}>
        Schritt 3: Fahrzeug wählen
      </div>
      <div style={{ transform: `scale(${cardScale})`, background: "#1e293b", borderRadius: 24, border: "2px solid #334155", padding: 40, width: 600, textAlign: "center" }}>
        {/* Van illustration placeholder */}
        <div style={{ width: "100%", height: 180, borderRadius: 16, background: "linear-gradient(135deg, #334155, #475569)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
          <svg width="120" height="80" viewBox="0 0 120 80" fill="none">
            <rect x="10" y="20" width="100" height="45" rx="8" fill="#64748b"/>
            <rect x="5" y="35" width="30" height="30" rx="4" fill="#475569"/>
            <circle cx="30" cy="65" r="8" fill="#1e293b" stroke="#94a3b8" strokeWidth="3"/>
            <circle cx="90" cy="65" r="8" fill="#1e293b" stroke="#94a3b8" strokeWidth="3"/>
            <rect x="70" y="25" width="35" height="20" rx="4" fill="#38bdf8" opacity="0.3"/>
          </svg>
        </div>
        <div style={{ fontFamily: heading, fontSize: 28, color: "#f8fafc" }}>Fiat Ducato L4H2</div>
        <div style={{ fontFamily: body, fontSize: 16, color: "#94a3b8", marginTop: 8, display: "flex", justifyContent: "center", gap: 24 }}>
          <span>B-MT 1234</span>
          <span>42.850 km</span>
          <span>Diesel</span>
          <span>6,36 m</span>
        </div>
      </div>
      <div style={{ opacity: btnOp, transform: `scale(${btnPulse})`, marginTop: 30 }}>
        <div style={{ fontFamily: body, fontSize: 20, fontWeight: 600, color: "#0f172a", background: "#38bdf8", padding: "16px 48px", borderRadius: 40 }}>
          Buchen & bezahlen →
        </div>
      </div>
    </AbsoluteFill>
  );
};
