import type { panelsEn } from './panels.en';

export const panelsDe: Record<keyof typeof panelsEn, string> = {
  'panels.tiles.azimuth': 'Azimut',
  'panels.tiles.elevation': 'Höhenwinkel',
  'panels.tiles.pan': 'Drehservo {v}°',
  'panels.tiles.tilt': 'Kippservo {v}°',
  'panels.tiles.light': 'Licht',
  'panels.tiles.luxNote': 'Lichtsensor am Panel',
  'panels.tiles.level': 'Lichtpegel',
  'panels.tiles.levelNote': 'Mittel der vier Sensoren',
  'panels.tiles.power': 'Panelleistung',
  'panels.tiles.estimated': 'geschätzt',
  'panels.tiles.measured': 'gemessen',
  'panels.tiles.gain': 'Gewinn',
  'panels.tiles.gainNote': 'gegenüber einem festen Panel',
  'panels.tiles.off': 'Abweichung',
  'panels.tiles.offNote': 'aus den Sensoren gelesen',
  'panels.tiles.about': 'etwa',
  'panels.tiles.under': 'unter',
  'panels.tiles.mode': 'Modus {mode}'
};
