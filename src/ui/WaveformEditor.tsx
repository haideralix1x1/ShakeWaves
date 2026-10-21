import { useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Line,
  Path,
  Stop,
} from 'react-native-svg';

import { PIANO_KEYS, snapToPianoValue } from '../audio/render';
import { profileToCycle } from '../audio/wave';
import { theme } from './theme';


interface Props {
  profile: number[];
  onChange: (index: number, value: number) => void;
  onNoteChange?: (value: number) => void;
  height?: number;
  width: number;
  color?: string;
  disabled?: boolean;
  showPoints?: boolean;
}

const TABLE = 256;
const PADDING = 22;

function buildCurve(points: number[], width: number, height: number): string {
  if (points.length < 2) return '';
  const cycle = profileToCycle(points, TABLE);
  const mid = height / 2;
  const amp = (height - 52) / 2;
  const effectiveW = width - 2 * PADDING;
  const total = TABLE - 1;
  let d = '';
  for (let i = 0; i <= total; i++) {
    const v = cycle[i];
    const x = PADDING + (i / total) * effectiveW;
    const y = mid - v * amp;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `;
  }
  return d.trim();
}

function pointPositions(points: number[], width: number, height: number) {
  const mid = height / 2;
  const amp = (height - 52) / 2;
  const effectiveW = width - 2 * PADDING;
  const n = points.length;
  return points.map((v, i) => ({
    x: PADDING + (i / (n - 1)) * effectiveW,
    y: mid - v * amp,
  }));
}

export function WaveformEditor({
  profile,
  onChange,
  onNoteChange,
  height = 200,
  width,
  color = theme.player,
  disabled = false,
  showPoints = true,
}: Props) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [layout, setLayout] = useState({ width, height });
  const active = useRef<number | null>(null);

  const w = layout.width || width;
  const h = layout.height || height;
  const mid = h / 2;
  const amp = (h - 52) / 2;
  const effectiveW = w - 2 * PADDING;
  const n = profile.length;

  const curve = useMemo(() => buildCurve(profile, w, h), [profile, w, h]);
  const handles = useMemo(() => pointPositions(profile, w, h), [profile, w, h]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: lw, height: lh } = e.nativeEvent.layout;
    if (lw > 0 && lh > 0) {
      setLayout({ width: lw, height: lh });
    }
  };

  const nearestPoint = (x: number) => {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const px = PADDING + (i / (n - 1)) * effectiveW;
      const d = Math.abs(px - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };

  const applyTouch = (e: GestureResponderEvent) => {
    if (disabled) return;
    const { locationY } = e.nativeEvent;
    const idx = active.current;
    if (idx === null || idx < 0 || idx >= n) return;

    const raw = (mid - locationY) / amp;
    const snapped = snapToPianoValue(raw);

    if (profile[idx] !== snapped) {
      onChange(idx, snapped);
      onNoteChange?.(snapped);
    }
  };

  const onStart = (e: GestureResponderEvent) => {
    if (disabled) return;
    const { locationX, locationY } = e.nativeEvent;
    const idx = nearestPoint(locationX);
    active.current = idx;
    setDragging(idx);

    const raw = (mid - locationY) / amp;
    const snapped = snapToPianoValue(raw);
    onChange(idx, snapped);
    onNoteChange?.(snapped);
  };

  const onMove = (e: GestureResponderEvent) => {
    if (disabled || active.current === null) return;
    applyTouch(e);
  };

  const onEnd = () => {
    active.current = null;
    setDragging(null);
  };

  return (
    <View
      style={[styles.wrap, { height: h }]}
      onLayout={onLayout}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderGrant={onStart}
      onResponderMove={onMove}
      onResponderRelease={onEnd}
      onResponderTerminate={onEnd}>
      <Svg width={w} height={h} pointerEvents="none">
        <Defs>
          <LinearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.28" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Horizontal piano key pitch lines & note labels */}
        {PIANO_KEYS.map((k) => {
          const y = mid - k.value * amp;
          const isCenter = k.value === 0;
          return (
            <Line
              key={k.note}
              x1={PADDING}
              y1={y}
              x2={w - PADDING}
              y2={y}
              stroke={isCenter ? theme.border : theme.border}
              strokeWidth={isCenter ? 1.2 : 0.8}
              strokeDasharray={isCenter ? undefined : '3,4'}
              opacity={isCenter ? 0.6 : 0.28}
            />
          );
        })}

        {/* Vertical piano step guides */}
        {handles.map((p, i) => (
          <Line
            key={`col-${i}`}
            x1={p.x}
            y1={mid - amp}
            x2={p.x}
            y2={mid + amp}
            stroke={theme.border}
            strokeWidth={1}
            strokeDasharray="2,3"
            opacity={0.2}
          />
        ))}

        {/* Waveform fill and line */}
        {curve ? (
          <Path
            d={`${curve} L${w - PADDING},${h - 4} L${PADDING},${h - 4} Z`}
            fill="url(#waveGrad)"
          />
        ) : null}
        <Path
          d={curve}
          stroke={color}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Piano key handles — circles only, no note-name labels */}
        {showPoints
          ? handles.map((p, i) => {
              const isDrag = dragging === i;
              return (
                <G key={`handle-${i}`}>
                  {/* Handle outer glow when dragging */}
                  {isDrag ? (
                    <Circle
                      cx={p.x}
                      cy={p.y}
                      r={16}
                      fill={color}
                      opacity={0.3}
                    />
                  ) : null}

                  {/* Handle circle */}
                  <Circle
                    cx={p.x}
                    cy={p.y}
                    r={isDrag ? 11 : 8.5}
                    fill={isDrag ? color : theme.bg}
                    stroke={color}
                    strokeWidth={2.5}
                  />
                </G>
              );
            })
          : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
  },
});
