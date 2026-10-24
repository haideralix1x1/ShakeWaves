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
import { theme } from './theme';

interface Props {
  profile: number[];
  timestamps?: number[];
  onChange: (index: number, value: number) => void;
  onTimestampsChange?: (timestamps: number[]) => void;
  onNoteChange?: (value: number) => void;
  onSelectPoint?: (index: number) => void;
  height?: number;
  width: number;
  color?: string;
  disabled?: boolean;
  showPoints?: boolean;
  playbackPoint?: number | null;
}

const PADDING = 22;
// PIANO_KEYS span from -2.75 (C3) to +2.50 (C6). Max amplitude scale factor:
const MAX_PIANO_SPAN = 2.85;

function computeHandles(
  points: number[],
  timestamps: number[] | undefined,
  width: number,
  height: number
) {
  const mid = height / 2;
  const amp = (height - 44) / (2 * MAX_PIANO_SPAN);
  const effectiveW = width - 2 * PADDING;
  const n = points.length;
  if (n === 0) return [];

  const maxTime = (timestamps && timestamps.length >= n && timestamps[n - 1] > 0)
    ? timestamps[n - 1]
    : Math.max(0.24 * (n - 1), 0.1);

  return points.map((v, i) => {
    let frac = i / Math.max(1, n - 1);
    if (timestamps && timestamps.length > i && maxTime > 0) {
      frac = Math.max(0, Math.min(1, timestamps[i] / maxTime));
    }
    const x = PADDING + frac * effectiveW;
    const y = Math.max(12, Math.min(height - 12, mid - v * amp));
    return { x, y };
  });
}

/**
 * Catmull-Rom to Cubic Bezier Spline
 * Smoothly interpolates through non-uniform 2D control points (x, y)
 */
function buildSplinePath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)} `;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += `C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)} `;
  }
  return d.trim();
}

export function WaveformEditor({
  profile,
  timestamps,
  onChange,
  onTimestampsChange,
  onNoteChange,
  onSelectPoint,
  height = 200,
  width,
  color = theme.player,
  disabled = false,
  showPoints = true,
  playbackPoint = null,
}: Props) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [layout, setLayout] = useState({ width, height });
  const active = useRef<number | null>(null);

  const w = layout.width || width;
  const h = layout.height || height;
  const mid = h / 2;
  const amp = (h - 44) / (2 * MAX_PIANO_SPAN);
  const effectiveW = w - 2 * PADDING;
  const n = profile.length;

  const handles = useMemo(
    () => computeHandles(profile, timestamps, w, h),
    [profile, timestamps, w, h]
  );
  const curve = useMemo(() => buildSplinePath(handles), [handles]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: lw, height: lh } = e.nativeEvent.layout;
    if (lw > 0 && lh > 0) {
      setLayout({ width: lw, height: lh });
    }
  };

  const nearestPoint = (x: number, y: number) => {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const hx = handles[i]?.x ?? (PADDING + (i / Math.max(1, n - 1)) * effectiveW);
      const hy = handles[i]?.y ?? mid;
      const d = Math.hypot(hx - x, hy - y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };

  const applyTouch = (e: GestureResponderEvent) => {
    if (disabled) return;
    const { locationX, locationY } = e.nativeEvent;
    const idx = active.current;
    if (idx === null || idx < 0 || idx >= n) return;

    // 1. Vertical motion modifies pitch/note
    const raw = (mid - locationY) / amp;
    const snapped = snapToPianoValue(raw);
    if (profile[idx] !== snapped) {
      onChange(idx, snapped);
      onNoteChange?.(snapped);
    }

    // 2. Horizontal motion modifies time/rhythm/pace
    if (onTimestampsChange) {
      const maxTime = (timestamps && timestamps.length >= n && timestamps[n - 1] > 0)
        ? timestamps[n - 1]
        : 0.24 * (n - 1);

      const minX = idx > 0 ? (handles[idx - 1]?.x ?? PADDING) + 14 : PADDING;
      const maxX = idx < n - 1 ? (handles[idx + 1]?.x ?? w - PADDING) - 14 : w - PADDING;
      const clampedX = Math.max(minX, Math.min(maxX, locationX));
      const frac = (clampedX - PADDING) / Math.max(1, effectiveW);
      const newTime = Math.max(0, frac * maxTime);

      const baseTimestamps = timestamps && timestamps.length >= n
        ? [...timestamps]
        : Array.from({ length: n }, (_, i) => i * 0.24);

      if (Math.abs(baseTimestamps[idx] - newTime) > 0.005) {
        baseTimestamps[idx] = newTime;
        onTimestampsChange(baseTimestamps);
      }
    }
  };

  const onStart = (e: GestureResponderEvent) => {
    if (disabled) return;
    const { locationX, locationY } = e.nativeEvent;
    const idx = nearestPoint(locationX, locationY);
    active.current = idx;
    setDragging(idx);
    onSelectPoint?.(idx);
    applyTouch(e);
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
          if (y < 6 || y > h - 6) return null;
          const isCenter = k.value === 0;
          return (
            <Line
              key={k.note}
              x1={PADDING}
              y1={y}
              x2={w - PADDING}
              y2={y}
              stroke={theme.border}
              strokeWidth={isCenter ? 1.2 : 0.8}
              strokeDasharray={isCenter ? undefined : '3,4'}
              opacity={isCenter ? 0.6 : 0.28}
            />
          );
        })}

        {/* Vertical note step guides: follow actual node positions */}
        {handles.map((p, i) => (
          <Line
            key={`col-${i}`}
            x1={p.x}
            y1={Math.max(10, mid - amp * MAX_PIANO_SPAN)}
            x2={p.x}
            y2={Math.min(h - 10, mid + amp * MAX_PIANO_SPAN)}
            stroke={theme.border}
            strokeWidth={1}
            strokeDasharray="2,3"
            opacity={0.2}
          />
        ))}

        {/* Waveform fill and line */}
        {curve && handles.length > 0 ? (
          <Path
            d={`${curve} L${handles[handles.length - 1].x.toFixed(2)},${h - 4} L${handles[0].x.toFixed(2)},${h - 4} Z`}
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

        {/* Live playback beam indicator */}
        {playbackPoint !== null && playbackPoint !== undefined && handles[playbackPoint] ? (
          <Line
            x1={handles[playbackPoint].x}
            y1={mid - amp - 12}
            x2={handles[playbackPoint].x}
            y2={mid + amp + 12}
            stroke={color}
            strokeWidth={2}
            strokeDasharray="4,4"
            opacity={0.8}
          />
        ) : null}

        {/* Piano key handles — circles with active drag and playback glow */}
        {showPoints
          ? handles.map((p, i) => {
              const isDrag = dragging === i;
              const isPlaying = playbackPoint === i;
              return (
                <G key={`handle-${i}`}>
                  {/* Handle outer glow when dragging or playing */}
                  {isDrag || isPlaying ? (
                    <Circle
                      cx={p.x}
                      cy={p.y}
                      r={isPlaying ? 20 : 16}
                      fill={color}
                      opacity={isPlaying ? 0.45 : 0.3}
                    />
                  ) : null}

                  {/* Handle circle */}
                  <Circle
                    cx={p.x}
                    cy={p.y}
                    r={isDrag || isPlaying ? 12 : 8.5}
                    fill={isDrag || isPlaying ? color : theme.bg}
                    stroke={color}
                    strokeWidth={isPlaying ? 3.5 : 2.5}
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
