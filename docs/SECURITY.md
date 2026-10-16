# Security

brainSOL is a static page. There is no backend of mine, no account, no telemetry and no error reporting. The page and its fonts come from the site you opened it on, served by GitHub Pages.

The page talks to one other place, and only when there is one: the tracker at the address shown in the status bar. That is a Raspberry Pi run by whoever shows the demo. The page keeps a WebSocket open to it and asks its `/api` for the chart history. Without an address the tracker is simulated in the tab and nothing else is contacted.

## Admin tools

Viewers can only watch. The admin tools need the PIN, and the PIN is checked on the Pi, never in the page: it is stored there as a salted PBKDF2 hash, five wrong tries lock it for 30 seconds and the wait doubles each time. A correct PIN gets a token that lasts 12 hours. In the simulation there is no PIN, because nothing outside the tab can be changed.

An https page cannot open a plain `ws://` socket, so a tracker on the local network is reached either through a tunnel with a proper certificate or by opening the page the Pi serves itself over http. The page explains this when it sees such an address and does not try to work around it.

## What stays on your machine

- **localStorage**: one key, `brainsol-preferences`, with the language, the theme and a saved tracker address.
- **sessionStorage**: `brainsol-admin`, the token of a live tracker while its admin tools are open. It goes when the tab closes.

## Reporting

If you find a security problem, please don't open a public issue. Use the private vulnerability reporting under the Security tab of this repository and I'll get back to you as soon as I can.
