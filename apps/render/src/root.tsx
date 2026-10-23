import React from 'react';
import { Composition, getInputProps } from 'remotion';
import { PocScene } from './poc';
import type { RenderInput } from '../../web/src/domain/motion';
export const Root = () => {
  const props = getInputProps() as unknown as { input: RenderInput };
  return (
    <Composition
      id="PocVertical"
      component={PocScene}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={300}
      defaultProps={props}
    />
  );
};
