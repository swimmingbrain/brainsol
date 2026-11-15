// the face of the solar panel: deep blue black with fine cell lines, two rows
// of narrow strips like the kit panel, drawn once into a canvas

import { CanvasTexture, SRGBColorSpace, type WebGLRenderer } from 'three';
import { ROLE_COLORS } from './assembly';

const COLUMNS = 8;
const ROWS = 2;

export function panelTexture(renderer: WebGLRenderer | null, width = 137, height = 85): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const w = 1024;
  const h = Math.round((w * height) / width);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return null;

  g.fillStyle = ROLE_COLORS.panel;
  g.fillRect(0, 0, w, h);

  const pad = Math.round(w * 0.025);
  const cw = (w - 2 * pad) / COLUMNS;
  const ch = (h - 2 * pad) / ROWS;

  // fine finger lines across each cell, barely there
  g.strokeStyle = 'rgba(120, 140, 190, 0.07)';
  g.lineWidth = 1;
  for (let y = pad; y < h - pad; y += 6) {
    g.beginPath();
    g.moveTo(pad, y + 0.5);
    g.lineTo(w - pad, y + 0.5);
    g.stroke();
  }

  // two thin bus bars down each strip
  g.strokeStyle = 'rgba(160, 172, 200, 0.16)';
  g.lineWidth = 2;
  for (let c = 0; c < COLUMNS; c++) {
    for (const k of [0.3, 0.7]) {
      const x = Math.round(pad + cw * (c + k)) + 0.5;
      g.beginPath();
      g.moveTo(x, pad);
      g.lineTo(x, h - pad);
      g.stroke();
    }
  }

  // the gaps between the cells, a little lighter than the cells
  g.strokeStyle = 'rgba(150, 165, 205, 0.32)';
  g.lineWidth = 3;
  for (let c = 0; c <= COLUMNS; c++) {
    const x = Math.round(pad + cw * c) + 0.5;
    g.beginPath();
    g.moveTo(x, pad);
    g.lineTo(x, h - pad);
    g.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    const y = Math.round(pad + ch * r) + 0.5;
    g.beginPath();
    g.moveTo(pad, y);
    g.lineTo(w - pad, y);
    g.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
  return texture;
}
