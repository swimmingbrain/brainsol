import { describe, expect, it } from 'vitest';
import { encode } from 'uqr';
import { qrShape } from './qr';

// paints the path back into a grid of modules to compare it with the encoder
function paint(path: string, size: number): boolean[][] {
  const grid = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  for (const match of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const [x, y, w] = [Number(match[1]), Number(match[2]), Number(match[3])];
    for (let i = 0; i < w; i++) grid[y][x + i] = true;
  }
  return grid;
}

describe('qrShape', () => {
  it('covers exactly the dark modules of the code, inside a quiet border', () => {
    const text = 'https://sol.swimmingbrain.dev/?pi=wss://tunnel.example.org';
    const shape = qrShape(text, 2);
    const qr = encode(text, { ecc: 'M', border: 0 });
    expect(shape.size).toBe(qr.size + 4);
    const grid = paint(shape.path, shape.size);
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) expect(grid[y + 2][x + 2]).toBe(qr.data[y][x]);
    // the border stays light
    expect(grid[0].some(Boolean)).toBe(false);
    expect(grid.map((row) => row[0]).some(Boolean)).toBe(false);
  });

  it('starts with the finder pattern in the top left corner as one run of seven', () => {
    expect(qrShape('https://sol.swimmingbrain.dev/', 2).path.startsWith('M2 2h7v1h-7z')).toBe(true);
  });

  it('gives the same path for the same text', () => {
    expect(qrShape('abc').path).toBe(qrShape('abc').path);
  });
});
