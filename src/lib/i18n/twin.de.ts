import type { twinEn } from './twin.en';

export const twinDe: Record<keyof typeof twinEn, string> = {
  'twin.label': 'Der Tracker in 3D',
  'twin.lampAz': 'Azimut der Lampe',
  'twin.lampEl': 'Höhenwinkel der Lampe',
  'twin.sunAz': 'Azimut der Sonne',
  'twin.sunEl': 'Höhenwinkel der Sonne',
  'twin.panelAz': 'Azimut des Moduls',
  'twin.panelEl': 'Höhenwinkel des Moduls',
  'twin.hint': 'Zieh die Lampe, um das Licht zu bewegen.',
  'twin.hintView': 'Ziehen dreht die Ansicht, Scrollen zoomt, ein Doppelklick führt zurück.',
  'twin.hintViewTouch': 'Seitlich wischen dreht, zwei Finger zoomen, zweimal tippen führt zurück.',
  'twin.lampLabel': 'Lampe bei Azimut {az} Grad und Höhe {el} Grad. Zieh sie oder nimm die Pfeiltasten, um das Licht zu bewegen.',
  'twin.lost': 'Die 3D Ansicht pausiert kurz. Sie kommt von selbst zurück.',
  'twin.flat': 'Dieser Browser kann die 3D Ansicht nicht zeigen, darum hier eine flache Zeichnung der Stellung.'
};
