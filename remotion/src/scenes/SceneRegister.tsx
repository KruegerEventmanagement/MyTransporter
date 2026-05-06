import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const { fontFamily: heading } = loadFont("normal", { weights: ["700"], subsets: ["latin"] });
const { fontFamily: body } = loadInter("normal", { weights: ["400", "600"], subsets: ["latin"] });

const TypeWriter = ({ text, startFrame, frame }: { text: string; startFrame: number; frame: number }) => {
  const chars = Math.min(text.length, Math.max(0, Math.floor((frame - startFrame) * 0.8)));
  return <>{text.slice(0, chars)}<span style={{ opacity: frame % 16 < 8 ? 1 : 0 }}>|</span></>;
};

export const SceneRegister = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const formScale = spring({ frame: frame - 10, fps, config: { damping: 15 } });

  const fields = [
    { label: "Vorname", value: "Max", start: 25 },
    { label: "Nachname", value: "Mustermann", start: 40 },
    { label: "E-Mail", value: "max@beispiel.de", start: 58 },
    { label: "Telefon", value: "+49 170 1234567", start: 78 },
  ];

  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", justifyContent: "center", alignItems: "center" }}>
      <div style={{ opacity: titleOp, fontFamily: heading, fontSize: 48, color: "#f8fafc", marginBottom: 30, textAlign: "center" }}>
        Schritt 4: Registrierung
      </div>
      <div style={{ transform: `scale(${formScale})`, background: "#1e293b", borderRadius: 24, border: "2px solid #334155", padding: 36, width: 500 }}>
        {fields.map((f, i) => (
          <div key={f.label} style={{ marginBottom: i < fields.length - 1 ? 16 : 0 }}>
            <div style={{ fontFamily: body, fontSize: 13, color: "#64748b", marginBottom: 6 }}>{f.label}</div>
            <div style={{
              background: "#0f172a", borderRadius: 12, border: "1px solid #334155", padding: "12px 16px",
              fontFamily: body, fontSize: 18, color: "#e2e8f0", minHeight: 24,
            }}>
              <TypeWriter text={f.value} startFrame={f.start} frame={frame} />
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
