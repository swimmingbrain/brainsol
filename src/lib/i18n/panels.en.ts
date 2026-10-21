// the english words of the viewer panels. every key starts with panels. and needs the same
// key in panels.de.ts, the type check and the tests hold the two together

export const panelsEn = {
  'panels.tiles.azimuth': 'Azimuth',
  'panels.tiles.elevation': 'Elevation',
  'panels.tiles.pan': 'pan servo {v}°',
  'panels.tiles.tilt': 'tilt servo {v}°',
  'panels.tiles.light': 'Light',
  'panels.tiles.luxNote': 'light sensor on the panel',
  'panels.tiles.level': 'Light level',
  'panels.tiles.levelNote': 'mean of the four sensors',
  'panels.tiles.power': 'Panel power',
  'panels.tiles.estimated': 'estimated',
  'panels.tiles.measured': 'measured',
  'panels.tiles.gain': 'Gain',
  'panels.tiles.gainNote': 'against a fixed panel',
  'panels.tiles.off': 'Off target',
  'panels.tiles.offNote': 'read from the sensors',
  'panels.tiles.about': 'about',
  'panels.tiles.under': 'under',
  'panels.tiles.mode': '{mode} mode'
} satisfies Record<`panels.${string}`, string>;
