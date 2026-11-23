import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

export const SEV_COLOR: Record<number, string> = {
  1: '#e83cff',
  2: '#b06cff',
  3: '#7d8bff',
  4: '#3fb0ff',
  5: '#2fd6e8',
  6: '#b8f3ff',
};
