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
  'panels.tiles.mode': '{mode} mode',

  'panels.balance.aria': 'The light on the four sensors and where the error points',
  'panels.balance.ex': 'Error left, right',
  'panels.balance.ey': 'Error down, up',
  'panels.balance.band': 'Dead band',
  'panels.balance.range': '{a} to {b}',
  'panels.balance.caption': 'The dot drifts toward the brighter side. The tracker turns until it sits in the middle.',

  'panels.charts.light': 'Light',
  'panels.charts.angles': 'Angles',
  'panels.charts.error': 'Error',
  'panels.charts.power': 'Power',
  'panels.charts.level': 'Level',
  'panels.charts.minutes': '{n} min',
  'panels.charts.window': 'Time window',
  'panels.charts.now': 'now'
} satisfies Record<`panels.${string}`, string>;
