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
  'panels.tiles.gainNote': 'gegen ein festes Panel',
  'panels.tiles.off': 'Abweichung',
  'panels.tiles.offNote': 'aus den Sensoren gelesen',
  'panels.tiles.about': 'etwa',
  'panels.tiles.under': 'unter',
  'panels.tiles.mode': 'Modus {mode}',

  'panels.balance.aria': 'Das Licht auf den vier Sensoren und wohin der Fehler zeigt',
  'panels.balance.ex': 'Fehler links, rechts',
  'panels.balance.ey': 'Fehler unten, oben',
  'panels.balance.band': 'Totzone',
  'panels.balance.range': '{a} bis {b}',
  'panels.balance.caption': 'Der Punkt wandert zur helleren Seite. Der Tracker dreht sich, bis er in der Mitte sitzt.',

  'panels.charts.light': 'Licht',
  'panels.charts.angles': 'Winkel',
  'panels.charts.error': 'Fehler',
  'panels.charts.power': 'Leistung',
  'panels.charts.level': 'Pegel',
  'panels.charts.minutes': '{n} min',
  'panels.charts.window': 'Zeitfenster',
  'panels.charts.now': 'jetzt'
};
