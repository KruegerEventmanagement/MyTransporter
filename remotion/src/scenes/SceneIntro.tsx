import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/SpaceGrotesk";

const { fontFamily } = loadFont("normal", { weights: ["700"], subsets: ["latin"] });

export const SceneIntro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });
  const subtitleOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const subtitleY = interpolate(frame, [30, 50], [30, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", justifyContent: "center", alignItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ transform: `scale(${logoScale})`, fontFamily, fontSize: 120, fontWeight: 700, color: "#38bdf8", letterSpacing: -3 }}>
          MyTransporter
        </div>
        <div style={{ opacity: subtitleOpacity, transform: `translateY(${subtitleY}px)`, fontFamily, fontSize: 36, color: "#94a3b8", marginTop: 20 }}>
          So einfach mietest du deinen Transporter
        </div>
      </div>
    </AbsoluteFill>
  );
};
