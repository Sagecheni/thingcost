import type { SVGProps } from 'react';

export type PixelIconName =
  | 'alert'
  | 'bell'
  | 'chest'
  | 'clock'
  | 'coin'
  | 'disk'
  | 'door'
  | 'gear'
  | 'home'
  | 'leaf'
  | 'moon'
  | 'package'
  | 'plus'
  | 'receipt'
  | 'screen'
  | 'sun'
  | 'trash';

type PixelRect = readonly [x: number, y: number, width: number, height: number];

const pixels: Record<PixelIconName, readonly PixelRect[]> = {
  home: [
    [6, 1, 4, 2],
    [4, 3, 8, 2],
    [2, 5, 12, 2],
    [3, 7, 10, 7],
    [6, 10, 4, 4],
  ],
  chest: [
    [3, 2, 10, 2],
    [2, 4, 12, 4],
    [1, 7, 14, 7],
    [3, 9, 4, 2],
    [9, 9, 4, 2],
    [7, 8, 2, 4],
  ],
  trash: [
    [5, 1, 6, 2],
    [2, 3, 12, 2],
    [3, 5, 10, 9],
    [5, 7, 2, 5],
    [9, 7, 2, 5],
  ],
  receipt: [
    [3, 1, 10, 2],
    [2, 3, 12, 10],
    [3, 13, 2, 2],
    [7, 13, 2, 2],
    [11, 13, 2, 2],
    [5, 5, 6, 2],
    [5, 9, 6, 2],
  ],
  leaf: [
    [10, 1, 4, 2],
    [7, 3, 7, 3],
    [4, 5, 9, 5],
    [2, 8, 8, 4],
    [1, 11, 5, 3],
    [6, 9, 2, 6],
  ],
  coin: [
    [5, 1, 6, 2],
    [3, 3, 10, 2],
    [2, 5, 12, 6],
    [3, 11, 10, 2],
    [5, 13, 6, 2],
    [7, 4, 2, 8],
    [9, 5, 2, 2],
    [5, 9, 2, 2],
  ],
  bell: [
    [7, 1, 2, 2],
    [5, 3, 6, 2],
    [3, 5, 10, 6],
    [2, 11, 12, 2],
    [6, 13, 4, 2],
  ],
  disk: [
    [2, 1, 11, 1],
    [1, 2, 13, 12],
    [4, 2, 7, 4],
    [5, 3, 4, 2],
    [4, 9, 8, 5],
    [6, 11, 4, 3],
  ],
  gear: [
    [6, 1, 4, 2],
    [3, 3, 10, 2],
    [1, 6, 14, 4],
    [3, 11, 10, 2],
    [6, 13, 4, 2],
    [6, 6, 4, 4],
  ],
  door: [
    [3, 1, 9, 14],
    [5, 3, 5, 10],
    [8, 7, 2, 2],
    [12, 13, 3, 2],
  ],
  package: [
    [4, 1, 8, 2],
    [2, 3, 12, 3],
    [1, 6, 14, 8],
    [7, 3, 2, 11],
    [4, 8, 2, 2],
    [10, 8, 2, 2],
  ],
  clock: [
    [5, 1, 6, 2],
    [3, 3, 10, 2],
    [2, 5, 12, 6],
    [3, 11, 10, 2],
    [5, 13, 6, 2],
    [7, 4, 2, 5],
    [8, 8, 4, 2],
  ],
  alert: [
    [7, 1, 2, 2],
    [5, 3, 6, 3],
    [3, 6, 10, 3],
    [1, 9, 14, 4],
    [7, 5, 2, 5],
    [7, 11, 2, 1],
  ],
  plus: [
    [6, 2, 4, 12],
    [2, 6, 12, 4],
  ],
  screen: [
    [1, 2, 14, 10],
    [3, 4, 10, 6],
    [6, 12, 4, 2],
    [4, 14, 8, 1],
  ],
  sun: [
    [7, 1, 2, 2],
    [7, 13, 2, 2],
    [1, 7, 2, 2],
    [13, 7, 2, 2],
    [4, 4, 8, 8],
    [2, 2, 2, 2],
    [12, 2, 2, 2],
    [2, 12, 2, 2],
    [12, 12, 2, 2],
  ],
  moon: [
    [5, 1, 5, 2],
    [3, 3, 6, 2],
    [2, 5, 6, 6],
    [3, 11, 7, 2],
    [5, 13, 6, 2],
    [8, 3, 4, 8],
  ],
};

interface PixelIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: PixelIconName;
  size?: number;
}

export function PixelIcon({ name, size = 20, ...props }: PixelIconProps) {
  return (
    <svg
      {...props}
      className={['pixel-icon', props.className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden={props['aria-label'] ? undefined : true}
    >
      {pixels[name].map(([x, y, width, height], index) => (
        <rect key={`${name}-${index}`} x={x} y={y} width={width} height={height} />
      ))}
    </svg>
  );
}
