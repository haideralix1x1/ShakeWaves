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
  if (n === 0) return '';
  const mid = height / 2;
  const amp = height / 2 - 4;
  let d = '';
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * width;
    const y = mid - values[i] * amp;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `;
  }
  return d.trim();
}

export function Waveform({
  data,
  color,
  height = 120,
  width = 320,
  strokeWidth = 2,
  dashed = false,
  opacity = 1,
  fill = false,
  baseline = true,
}: Props) {
  const d = toPath(data, width, height);
  return (
    <View style={[styles.wrap, { height, width }]}>
      <Svg width={width} height={height}>
        {baseline ? (
          <Path
            d={`M0,${height / 2} L${width},${height / 2}`}
            stroke={theme.border}
            strokeWidth={1}
          />
        ) : null}
        {fill && d ? <Path d={`${d} L${width},${height / 2} L0,${height / 2} Z`} fill={color} opacity={0.12} /> : null}
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
});
