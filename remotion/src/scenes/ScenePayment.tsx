import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const { fontFamily: heading } = loadFont("normal", { weights: ["700"], subsets: ["latin"] });
const { fontFamily: body } = loadInter("normal", { weights: ["400", "600"], subsets: ["latin"] });

export const ScenePayment = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardScale = spring({ frame: frame - 5, fps, config: { damping: 14 } });
  const btnClick = frame >= 40 && frame < 55 ? interpolate(frame, [40, 45, 55], [1, 0.95, 1], { extrapolateRight: "clamp" }) : 1;
  const successScale = spring({ frame: frame - 55, fps, config: { damping: 10 } });
  const rocketY = frame > 60 ? interpolate(frame, [60, 90], [0, -80], { extrapolateRight: "clamp" }) : 0;

  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", justifyContent: "center", alignItems: "center" }}>
      {frame < 55 ? (
        <>
          <div style={{ fontFamily: heading, fontSize: 48, color: "#f8fafc", marginBottom: 30, textAlign: "center" }}>
            Bezahlung
          </div>
          <div style={{ transform: `scale(${cardScale})`, background: "#1e293b", borderRadius: 24, border: "2px solid #334155", padding: 36, width: 450, textAlign: "center" }}>
            <div style={{ fontFamily: body, fontSize: 16, color: "#64748b", marginBottom: 8 }}>Zu zahlen</div>
            <div style={{ fontFamily: heading, fontSize: 56, color: "#f8fafc", marginBottom: 16 }}>350 €</div>
            <div style={{ fontFamily: body, fontSize: 14, color: "#64748b", marginBottom: 24 }}>150 € Miete + 200 € Kaution</div>
            <div
              style={{
                transform: `scale(${btnClick})`,
                fontFamily: body, fontSize: 20, fontWeight: 600, color: "#0f172a",
                background: "#38bdf8", padding: "16px 40px", borderRadius: 40, display: "inline-block",
              }}
            >
              Jetzt bezahlen
            </div>
          </div>
        </>
      ) : (
        <div style={{ transform: `scale(${Math.max(0, successScale)})`, textAlign: "center" }}>
          <div style={{ fontSize: 80, transform: `translateY(${rocketY}px)` }}>🚀</div>
          <div style={{ fontFamily: heading, fontSize: 56, color: "#4ade80", marginTop: 20 }}>Los geht's!</div>
          <div style={{ fontFamily: body, fontSize: 24, color: "#94a3b8", marginTop: 12 }}>Viel Spaß mit deinem Transporter</div>
        </div>
      )}
    </AbsoluteFill>
  );
};
