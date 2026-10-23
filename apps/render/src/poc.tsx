import React, { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  interpolate,
  delayRender,
  continueRender,
  cancelRender,
} from 'remotion';
import type { RenderInput } from '../../web/src/domain/motion';

const ramp = (f: number, start: number, end: number) =>
  interpolate(f, [start, end], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
export const PocScene: React.FC<{ input: RenderInput }> = ({ input }) => {
  const frame = useCurrentFrame();
  const [fontHandle] = useState(() => delayRender('Load frozen local font'));
  useEffect(() => {
    document.fonts
      .load('700 72px StudioNoto')
      .then(() => continueRender(fontHandle))
      .catch(cancelRender);
  }, [fontHandle]);
  const title = input.scene.layers.find(
    (l) => l.kind === 'component' && l.component === 'KineticText',
  );
  if (!title || title.kind !== 'component' || title.component !== 'KineticText')
    throw new Error('Missing title');
  const subtitle = input.timeline.subtitles.find(
    (c) => frame >= c.startFrame && frame < c.endFrame,
  );
  const reveal = ramp(frame, 4, 30);
  const values = input.dataset.values;
  return (
    <AbsoluteFill
      style={{
        background: '#071122',
        color: '#f4f7ff',
        fontFamily: 'StudioNoto',
        overflow: 'hidden',
      }}
    >
      <style>{`@font-face{font-family:StudioNoto;src:url("${staticFile('NotoSansSC-subset.woff2')}");font-weight:100 900;font-display:block}`}</style>
      <OffthreadVideo
        src={staticFile('background.mp4')}
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <AbsoluteFill
        style={{
          background: 'linear-gradient(180deg,rgba(7,17,34,.28),transparent 50%,rgba(7,17,34,.75))',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 126,
          left: 90,
          right: 90,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 23,
          letterSpacing: 4,
          color: '#88a2c4',
        }}
      >
        <span>CODE VIDEO LAB</span>
        <span>02 / POC</span>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 305,
          left: 88,
          right: 60,
          opacity: reveal,
          transform: `translateY(${(1 - reveal) * 36}px)`,
        }}
      >
        <div style={{ fontSize: 26, letterSpacing: 5, color: '#66e7c3', marginBottom: 35 }}>
          VIDEO + CODE
        </div>
        <div
          style={{
            fontSize: title.props.fontSize,
            fontWeight: 700,
            lineHeight: 1.4,
            letterSpacing: -2,
          }}
        >
          {title.props.text}
        </div>
        <div style={{ fontSize: 31, color: '#9fb4cf', marginTop: 30 }}>真实视频 × React 图表</div>
        <div
          style={{
            width: 86 + ramp(frame, 25, 85) * 650,
            height: 3,
            background: '#66e7c3',
            marginTop: 52,
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          top: 810,
          left: 75,
          width: 930,
          height: 655,
          border: '1px solid #304c70',
          borderRadius: 30,
          background: 'rgba(10,27,49,.92)',
          opacity: ramp(frame, 24, 48),
          transform: `translateY(${(1 - ramp(frame, 24, 48)) * 24}px)`,
        }}
      >
        <div
          style={{
            margin: '43px 44px 0',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 22,
            color: '#a6bdd9',
          }}
        >
          <span>FRAME BY FRAME</span>
          <span>示例数据 · 非真实测量</span>
        </div>
        <svg
          viewBox="0 0 840 500"
          width="840"
          height="500"
          style={{ position: 'absolute', left: 44, top: 112 }}
        >
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1="45" x2="820" y1={365 - v * 2.7} y2={365 - v * 2.7} stroke="#27405c" />
              <text x="6" y={373 - v * 2.7} fill="#7d98b8" fontSize="19">
                {v}
              </text>
            </g>
          ))}
          {values.map((v, i) => {
            const amount = ramp(frame, 45 + i * 12, 110 + i * 12);
            const height = v * 2.7 * amount;
            return (
              <g key={i}>
                <rect
                  x={115 + i * 240}
                  y={365 - height}
                  width="130"
                  height={height}
                  rx="10"
                  fill={['#648dff', '#66e7c3', '#ffd095'][i]}
                />
                <text
                  x={180 + i * 240}
                  y={344 - height}
                  textAnchor="middle"
                  fill="#f4f7ff"
                  fontSize="31"
                  fontWeight="700"
                >
                  {Math.round(v * amount)}
                </text>
                <text x={180 + i * 240} y="418" textAnchor="middle" fill="#9fb4cf" fontSize="25">
                  {['A', 'B', 'C'][i]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 1550,
          left: 70,
          right: 70,
          textAlign: 'center',
          fontSize: 37,
          fontWeight: 600,
          minHeight: 90,
          opacity: subtitle
            ? Math.min(
                ramp(frame, subtitle.startFrame, subtitle.startFrame + 7),
                1 - ramp(frame, subtitle.endFrame - 7, subtitle.endFrame),
              )
            : 0,
        }}
      >
        {subtitle?.text}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 107,
          left: 90,
          right: 90,
          display: 'flex',
          justifyContent: 'space-between',
          color: '#7896b9',
          fontSize: 21,
        }}
      >
        <span>自制测试素材 · 可信预置</span>
        <span>FRAME {String(frame).padStart(3, '0')} / 300</span>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 64,
          left: 90,
          width: ramp(frame, 0, 299) * 900,
          height: 3,
          background: '#648dff',
        }}
      />
    </AbsoluteFill>
  );
};
