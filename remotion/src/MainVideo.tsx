import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { SceneIntro } from "./scenes/SceneIntro";
import { SceneDate } from "./scenes/SceneDate";
import { SceneTime } from "./scenes/SceneTime";
import { SceneVehicle } from "./scenes/SceneVehicle";
import { SceneRegister } from "./scenes/SceneRegister";
import { SceneDocScan } from "./scenes/SceneDocScan";
import { SceneVerify } from "./scenes/SceneVerify";
import { ScenePayment } from "./scenes/ScenePayment";

export const MainVideo = () => {
  return (
    <AbsoluteFill style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)" }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={90}>
          <SceneIntro />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={linearTiming({ durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={100}>
          <SceneDate />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={linearTiming({ durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={90}>
          <SceneTime />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={100}>
          <SceneVehicle />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={linearTiming({ durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={110}>
          <SceneRegister />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={110}>
          <SceneDocScan />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={linearTiming({ durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={100}>
          <SceneVerify />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={90}>
          <ScenePayment />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
