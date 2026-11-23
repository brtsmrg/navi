import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

export const SEV_COLOR: Record<number, string> = {
  1: '#ff3b30',
  2: '#ff7a2b',
  3: '#ffb02e',
  4: '#e9d84a',
  5: '#7fd6a1',
  6: '#5f9bb3',
};
