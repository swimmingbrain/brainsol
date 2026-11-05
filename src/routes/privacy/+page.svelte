<script lang="ts">
  import Logo from '$lib/ui/Logo.svelte';
</script>

<svelte:head>
  <title>Privacy Policy | brainSOL</title>
  <meta name="description" content="brainSOL privacy policy. No account, no analytics, the page only talks to the tracker shown in the status bar." />
  <link rel="canonical" href="https://sol.swimmingbrain.dev/privacy" />
  <meta property="og:title" content="Privacy Policy | brainSOL" />
  <meta property="og:url" content="https://sol.swimmingbrain.dev/privacy" />
</svelte:head>

<div class="legal">
  <nav class="nav">
    <div class="nav-inner">
      <a href="/" class="logo" data-sveltekit-reload>
        <span class="logo-mark"><Logo size={24} /></span>
        <span class="logo-name">brainSOL</span>
      </a>
    </div>
  </nav>

  <div class="content">
    <h1>Privacy Policy</h1>
    <p class="updated">Last updated: November 2026</p>

    <h2>Overview</h2>
    <p>
      brainSOL is a web page that shows a small solar tracker following the light, live from the tracker or
      from a simulation that runs in your browser. There is no account and nothing to sign in to. We do not
      collect personal data and we do not track you.
    </p>

    <h2>What the page connects to</h2>
    <p>
      The page itself, its fonts included, comes from the site you opened it on. It also reads
      <code>config.json</code> from the same site, a small file that says which tracker to show.
    </p>
    <p>
      Apart from that, the page connects only to the tracker address shown in the status bar at the bottom of
      the page. It keeps a WebSocket open to the tracker for the live data and asks the tracker for the last
      minutes of its history to fill the charts and for the experiment results it keeps. The address comes
      from <code>config.json</code>, from <code>?pi=</code> in the page address, or from an address you saved
      yourself. When the status bar says simulation, the tracker is simulated in your browser and the page
      does not connect anywhere else. An admin who tests a new tracker address in the admin tools makes the
      page ask that address once whether a tracker answers there.
    </p>
    <p>
      The tracker is a small computer run by whoever shows the demo. Like any server, it sees your IP address
      and your browser while you are connected. It counts the connected pages for the viewer number in the top
      bar. The page sends it no information about you, only a ping every few seconds to measure the delay, and
      the commands of the admin tools if you unlock them.
    </p>

    <h2>Data stored in your browser</h2>
    <p>
      <strong>localStorage</strong> holds one key, <code>brainsol-preferences</code>, with the language, the
      theme and a tracker address if you saved one.
    </p>
    <p>
      <strong>sessionStorage</strong> holds <code>brainsol-admin</code> while the admin tools of a live tracker
      are unlocked: the address of the tracker and the token it handed out, so a reload keeps the tools open.
      The browser deletes it when the tab closes, and the token runs out after 12 hours anyway.
    </p>
    <p>
      None of it leaves your browser, and you can clear all of it at any time through your browser settings.
    </p>

    <h2>Analytics</h2>
    <p>
      We do not use tracking scripts, analytics services or advertising networks.
    </p>

    <h2>Hosting</h2>
    <p>
      The site is served by GitHub Pages. Like any web server, GitHub receives the usual request data when your
      browser loads the page, such as your IP address and browser, and GitHub's privacy statement applies.
      Nothing about you is sent with it.
    </p>

    <h2>Cookies</h2>
    <p>
      brainSOL does not use cookies. The settings listed above are stored in localStorage and sessionStorage.
    </p>

    <h2>Changes</h2>
    <p>
      We may update this policy from time to time. Changes will be reflected on this page with an updated date.
    </p>

    <h2>Contact</h2>
    <p>
      For questions about this policy, contact us via
      <a href="https://github.com/swimmingbrain/brainsol" target="_blank" rel="noopener">GitHub</a>.
    </p>
  </div>

  <footer class="footer">
    <a href="/" data-sveltekit-reload>&larr; Back to brainSOL</a>
  </footer>
</div>

<style>
  /* the app shell pins html and body to the viewport and hides the overflow.
     the legal pages are documents, so they hand the scrolling back. the two
     selectors are deliberately heavier than app.css's plain `html, body`,
     because which of the two stylesheets loads last is not fixed */
  :global(html:root), :global(html body) {
    height: auto;
    overflow: auto;
  }

  .legal {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-deep);
  }

  .nav {
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
  }

  .nav-inner {
    max-width: 720px;
    margin: 0 auto;
    padding: 0 32px;
    height: 48px;
    display: flex;
    align-items: center;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
  }

  .logo-mark {
    display: flex;
    align-items: center;
    color: var(--accent);
  }

  .logo-name {
    font-size: 18px;
    color: var(--text-primary);
  }

  .content {
    flex: 1;
    max-width: 720px;
    margin: 0 auto;
    padding: 48px 32px;
    width: 100%;
  }

  h1 {
    font-size: 28px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 4px;
  }

  .updated {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 32px;
  }

  h2 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 24px 0 8px;
  }

  p {
    font-size: 14px;
    line-height: 1.7;
    color: var(--text-secondary);
  }

  /* only the headings space the sections, so paragraphs need their own gap */
  p + p {
    margin-top: 12px;
  }

  p a {
    color: var(--accent);
    text-decoration: none;
  }

  p a:hover {
    color: var(--accent-hover);
  }

  /* the storage keys are named exactly, so they sit in a small box of their own */
  p :global(code) {
    font-size: 12px;
    color: var(--text-primary);
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 1px 5px;
    white-space: nowrap;
  }

  .footer {
    border-top: 1px solid var(--border);
    padding: 16px 32px;
    max-width: 720px;
    margin: 0 auto;
    width: 100%;
  }

  .footer a {
    font-size: 12px;
    color: var(--text-muted);
    text-decoration: none;
  }

  .footer a:hover {
    color: var(--accent);
  }

  @media (max-width: 480px) {
    .nav-inner,
    .content,
    .footer {
      padding-left: 16px;
      padding-right: 16px;
    }
  }
</style>
