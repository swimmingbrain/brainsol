// a qr code as one svg path, so the page can draw it in its own colours.
// uqr does the encoding, this only turns the dark modules into rectangles,
// one per run along a row to keep the path short

import { encode } from 'uqr';

export interface QrShape {
  // modules per side, the quiet border included
  size: number;
  path: string;
}

export function qrShape(text: string, border = 2): QrShape {
  // medium error correction still reads off a projector with some glare
  const qr = encode(text, { ecc: 'M', border: 0 });
  const parts: string[] = [];
  qr.data.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end]) end++;
      parts.push(`M${x + border} ${y + border}h${end - x}v1h-${end - x}z`);
      x = end;
    }
  });
  return { size: qr.size + 2 * border, path: parts.join('') };
}
