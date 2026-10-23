import type { adminEn } from './admin.en';

export const adminDe: Record<keyof typeof adminEn, string> = {
  'admin.unlock.title': 'Adminbereich',
  'admin.unlock.live': 'Gib die PIN des Trackers unter {host} ein.',
  'admin.unlock.waiting': 'Warte auf eine Antwort des Trackers unter {host}.',
  'admin.unlock.pin': 'PIN',
  'admin.unlock.submit': 'Entsperren',
  'admin.unlock.checking': 'Wird geprüft',
  'admin.unlock.wrong': 'Falsche PIN, versuch es noch einmal.',
  'admin.unlock.locked': 'Zu viele falsche Versuche. Der nächste Versuch geht in {wait}.',
  'admin.unlock.free': 'Du kannst es jetzt wieder versuchen.',
  'admin.unlock.sim': 'Die Simulation läuft in diesem Browser, deshalb gibt es keine PIN.',
  'admin.unlock.open': 'Adminbereich öffnen',
  'admin.unlock.isOpen': 'Der Adminbereich ist offen. Er liegt neben der Bühne, am Handy darunter.',
  'admin.unlock.lock': 'Wieder sperren',
  'admin.unlock.opened': 'Der Adminbereich ist offen',
  'admin.unlock.closed': 'Der Adminbereich ist gesperrt',

  'admin.dock.label': 'Adminbereich',
  'admin.tab.control': 'Steuerung',

  'admin.group.mode': 'Modus',
  'admin.mode.label': 'Modus des Trackers',
  'admin.mode.waiting': 'Warte auf das erste Bild vom Tracker.',
  'admin.mode.unsupported': 'Diesen Modus kann der Tracker noch nicht',
  'admin.mode.missing': 'Diese Modi kann der Tracker noch nicht: {modes}.',
  'admin.mode.about.auto': 'Folgt dem Licht mit den vier Sensoren.',
  'admin.mode.about.manual': 'Fährt dorthin, wo du ihn hinschickst, mit dem Joystick oder einem Ziel.',
  'admin.mode.about.sun': 'Folgt der berechneten Sonne für den Standort weiter unten.',
  'admin.mode.about.hold': 'Bleibt genau dort stehen, wo er gerade ist.',
  'admin.mode.about.park': 'Legt das Modul flach hin und ruht.',
  'admin.mode.about.demo': 'Spielt eine langsame, ruhige Choreografie für die Ausstellung.'
};
