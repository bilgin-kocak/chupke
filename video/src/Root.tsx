import React from "react";
import { Composition } from "remotion";
import { Chupke } from "./Chupke";
import { FPS, T } from "./time";

export const Root: React.FC = () => (
  <Composition id="Chupke" component={Chupke} durationInFrames={Math.round(T.duration * FPS)} fps={FPS} width={1920} height={1080} />
);
