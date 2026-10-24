import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { theme } from './theme';

interface Props {
  data: number[] | Float32Array;
  color: string;
  height?: number;
  width?: number;
  strokeWidth?: number;
  dashed?: boolean;
  opacity?: number;
  fill?: boolean;
  baseline?: boolean;
}

function toPath(values: ArrayLike<number>, width: number, height: number): string {
  const n = values.length;
  if (n === 0 || width <= 0 || height <= 0) return '';

  // Dynamically determine the maximum peak amplitude in the data
  let maxAbs = 1.0;
  for (let i = 0; i < n; i++) {
    const abs = Math.abs(values[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  // Add a 12% safety margin so the curve never clips against container edges
  maxAbs *= 1.12;

  const mid = height / 2;
  const pad = 4;
  const amp = (height / 2 - pad) / maxAbs;

  let d = '';
  for (let i = 0; i < n; i++) {
    const rawX = n > 1 ? (i / (n - 1)) * width : width / 2;
    const x = Math.max(0, Math.min(width, rawX));
    const rawY = mid - values[i] * amp;
    const y = Math.max(pad, Math.min(height - pad, rawY));
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `;
  }
  return d.trim();
}

export function Waveform({
  data,
  color,
  height = 120,
  width: propWidth,
  strokeWidth = 2,
  dashed = false,
  opacity = 1,
  fill = false,
  baseline = true,
}: Props) {
  const [measuredWidth, setMeasuredWidth] = useState(propWidth || 0);
  const w = propWidth || measuredWidth || 300;
  const d = toPath(data, w, height);

  return (
    <View
      style={[styles.wrap, { height, width: propWidth || '100%' }]}
      onLayout={(e) => {
        const layoutW = Math.floor(e.nativeEvent.layout.width);
        if (layoutW > 0 && layoutW !== measuredWidth) {
          setMeasuredWidth(layoutW);
        }
      }}>
      {w > 0 && (
        <Svg width={w} height={height}>
          {baseline ? (
            <Path
              d={`M0,${height / 2} L${w},${height / 2}`}
              stroke={theme.border}
              strokeWidth={1}
            />
          ) : null}
          {fill && d ? (
            <Path
              d={`${d} L${w},${height / 2} L0,${height / 2} Z`}
              fill={color}
              opacity={0.12}
            />
          ) : null}
          <Path
            d={d}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            opacity={opacity}
            strokeDasharray={dashed ? '6,5' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
