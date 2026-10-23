// the english words of the admin tools. every key starts with admin. and needs the same
// key in admin.de.ts, the type check and the tests hold the two together

export const adminEn = {
  'admin.unlock.title': 'Admin tools',
  'admin.unlock.live': 'Enter the PIN of the tracker at {host}.',
  'admin.unlock.waiting': 'Waiting for the tracker at {host} to answer.',
  'admin.unlock.pin': 'PIN',
  'admin.unlock.submit': 'Unlock',
  'admin.unlock.checking': 'Checking',
  'admin.unlock.wrong': 'Wrong PIN, try again.',
  'admin.unlock.locked': 'Too many wrong tries. The next try is possible in {wait}.',
  'admin.unlock.free': 'You can try again now.',
  'admin.unlock.sim': 'The simulation runs in this browser, so there is no PIN.',
  'admin.unlock.open': 'Open the admin tools',
  'admin.unlock.isOpen': 'The admin tools are open. They sit next to the stage, on a phone below it.',
  'admin.unlock.lock': 'Lock again',
  'admin.unlock.opened': 'Admin tools are open',
  'admin.unlock.closed': 'Admin tools are locked',

  'admin.dock.label': 'Admin tools',
  'admin.tab.control': 'Control',

  'admin.group.mode': 'Mode',
  'admin.mode.label': 'Mode of the tracker',
  'admin.mode.waiting': 'Waiting for the first frame of the tracker.',
  'admin.mode.unsupported': 'This tracker cannot do this mode yet',
  'admin.mode.missing': 'This tracker cannot do these modes yet: {modes}.',
  'admin.mode.about.auto': 'Follows the light with the four sensors.',
  'admin.mode.about.manual': 'Goes where you send it, with the joystick or a target.',
  'admin.mode.about.sun': 'Follows the computed sun for the site set below.',
  'admin.mode.about.hold': 'Stays exactly where it is.',
  'admin.mode.about.park': 'Lays the panel flat and rests.',
  'admin.mode.about.demo': 'Plays a slow, calm choreography for an idle exhibit.'
} satisfies Record<`admin.${string}`, string>;
