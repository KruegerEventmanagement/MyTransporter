import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const { fontFamily: heading } = loadFont("normal", { weights: ["700"], subsets: ["latin"] });
const { fontFamily: body } = loadInter("normal", { weights: ["400", "600"], subsets: ["latin"] });

export const SceneVerify = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const step1Op = interpolate(frame, [5, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const step2Op = interpolate(frame, [25, 35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const step3Op = interpolate(frame, [45, 55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const checkScale = spring({ frame: frame - 65, fps, config: { damping: 10 } });

  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", justifyContent: "center", alignItems: "center" }}>
      <div style={{ fontFamily: heading, fontSize: 44, color: "#f8fafc", marginBottom: 40, textAlign: "center" }}>
        Profil erstellen & verifizieren
      </div>
      <div style={{ background: "#1e293b", borderRadius: 24, border: "2px solid #334155", padding: 36, width: 500 }}>
        <div style={{ opacity: step1Op, display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📧</div>
          <div>
            <div style={{ fontFamily: body, fontSize: 18, color: "#e2e8f0", fontWeight: 600 }}>E-Mail bestätigen</div>
            <div style={{ fontFamily: body, fontSize: 14, color: "#64748b" }}>Link in deiner Inbox klicken</div>
          </div>
        </div>
        <div style={{ opacity: step2Op, display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🔗</div>
          <div>
            <div style={{ fontFamily: body, fontSize: 18, color: "#e2e8f0", fontWeight: 600 }}>Zurück zum Profil</div>
            <div style={{ fontFamily: body, fontSize: 14, color: "#64748b" }}>Deine Auswahl ist gespeichert</div>
          </div>
        </div>
        <div style={{ opacity: step3Op, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: "#4ade80", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>✓</div>
          <div>
            <div style={{ fontFamily: body, fontSize: 18, color: "#e2e8f0", fontWeight: 600 }}>Profil verifiziert</div>
            <div style={{ fontFamily: body, fontSize: 14, color: "#64748b" }}>Weiter zur Zahlung</div>
          </div>
        </div>
      </div>
      {frame > 65 && (
        <div style={{ transform: `scale(${checkScale})`, marginTop: 30, fontFamily: body, fontSize: 22, color: "#4ade80", fontWeight: 600 }}>
          ✓ Alles bereit!
        </div>
      )}
    </AbsoluteFill>
  );
};
