// The whole film: one background, every scene on the absolute clock, captions, voice, sound effects and the soundtrack.
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { Background, Captions } from "./components";
import { Close, Hood, Hook, Pay, Pitch, Privacy, STAMPS, Safety, Shop, TYPES, Title, Wallet, Watch } from "./scenes";
import { DROP, FPS, T, VO, clamp01, ramp, useSeconds } from "./time";

type Cue = { at: number; sfx: string; volume: number; seconds?: number };
const cue = (at: number, sfx: string, volume: number, seconds?: number): Cue => ({ at, sfx, volume, seconds });

const SFX: Cue[] = [
  // the checkout that keeps everything
  ...TYPES.map((at) => cue(at, "typing", 0.22, 0.75)),
  ...STAMPS.map((at) => cue(at, "stamp", 0.75, 0.9)),
  // the title
  cue(DROP - 1.9, "riser", 0.22),
  cue(DROP - 0.35, "whoosh", 0.3),
  cue(DROP, "ring", 0.7), cue(DROP, "sting", 0.45),
  // the idea
  cue(15.2, "pop1", 0.3), cue(17.1, "pop2", 0.3), cue(19.8, "pop3", 0.3), cue(23.9, "pop1", 0.3),
  // the live order
  cue(26.85, "whoosh", 0.2),
  cue(27.3, "pop2", 0.28), cue(27.9, "typing", 0.2, 1.1), cue(29.0, "pop3", 0.28), cue(30.9, "pop1", 0.28),
  cue(33.6, "typing", 0.22, 0.9), cue(35.3, "ping2", 0.5),
  cue(37.7, "pop1", 0.32), cue(38.4, "pop2", 0.32), cue(39.2, "pop3", 0.32), cue(41.4, "pop1", 0.32), cue(42.8, "ping3", 0.5),
  // the code arrives
  cue(44.4, "ping1", 0.6), cue(44.8, "success", 0.5),
  // careful with money
  cue(50.0, "whoosh", 0.22),
  cue(52.0, "pop1", 0.35), cue(55.2, "pop2", 0.35), cue(57.4, "pop3", 0.35), cue(60.5, "ping2", 0.5),
  // who sees what
  cue(66.3, "whoosh", 0.2),
  cue(66.9, "pop1", 0.3), cue(69.1, "pop2", 0.3), cue(71.4, "pop3", 0.3), cue(73.8, "pop1", 0.3),
  // under the hood
  cue(77.5, "whoosh", 0.2), cue(78.0, "pop1", 0.3), cue(78.9, "pop2", 0.3), cue(79.8, "pop3", 0.35),
  // the close
  cue(T.final - 0.3, "whoosh", 0.25),
  cue(T.final, "ring", 0.75), cue(T.final, "sting", 0.45), cue(T.final + 0.2, "ring_long", 0.35),
];

// The music ducks under every spoken line and opens up between them, at the drop and on the close.
const SPEECH = Object.values(VO).map((v) => [v.start, v.start + v.duration] as const);
export const musicGain = (t: number) => {
  let gap = Infinity;
  for (const [s, e] of SPEECH) gap = Math.min(gap, t < s ? s - t : t > e ? t - e : 0);
  const duck = 0.3 + 0.7 * clamp01((gap - 0.1) / 0.35);
  const base = t < DROP ? 0.55 : 0.3;
  const open = (t >= DROP && t < DROP + 0.5) || t >= T.final + 3.6 ? 1.8 : 1;
  return Math.min(1, base * duck * open) * (1 - ramp(t, T.duration - 1.4, T.duration));
};

export const Chupke: React.FC = () => {
  const t = useSeconds();
  return (
    <AbsoluteFill>
      <Background t={t} />
      <Hook t={t} />
      <Title t={t} />
      <Pitch t={t} />
      <Shop t={t} />
      <Pay t={t} />
      <Watch t={t} />
      <Wallet t={t} />
      <Safety t={t} />
      <Privacy t={t} />
      <Hood t={t} />
      <Close t={t} />
      <Captions t={t} hidden={["vo02", "vo12"]} />
      <AbsoluteFill style={{ background: "#000", opacity: ramp(t, T.duration - 0.7, T.duration) }} />

      <Audio src={staticFile("audio/music.wav")} volume={(f) => musicGain(f / FPS)} />
      {Object.entries(VO).map(([name, vo]) => (
        <Sequence key={name} from={Math.round(vo.start * FPS)} durationInFrames={Math.ceil((vo.duration + 0.3) * FPS)} layout="none">
          <Audio src={staticFile(vo.file)} />
        </Sequence>
      ))}
      {SFX.map((c, i) => (
        <Sequence key={i} from={Math.round(c.at * FPS)} durationInFrames={c.seconds ? Math.round(c.seconds * FPS) : undefined} layout="none">
          <Audio src={staticFile(`audio/use/sfx_${c.sfx}.mp3`)} volume={c.seconds ? (f) => c.volume * clamp01((c.seconds! * FPS - f) / (0.15 * FPS)) : c.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
