<script lang="ts">
  import Logo from '$lib/ui/Logo.svelte';
</script>

<svelte:head>
  <title>Terms of Service | brainSOL</title>
  <meta name="description" content="brainSOL terms of service. What you can expect from us and what we ask of you." />
  <link rel="canonical" href="https://sol.swimmingbrain.dev/terms" />
  <meta property="og:title" content="Terms of Service | brainSOL" />
  <meta property="og:url" content="https://sol.swimmingbrain.dev/terms" />
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
    <h1>Terms of Service</h1>
    <p class="updated">Last updated: November 2026</p>

    <h2>Acceptance</h2>
    <p>
      By using brainSOL you agree to these terms. If you do not agree, please do not use the service.
    </p>

    <h2>Description of the service</h2>
    <p>
      brainSOL is a free web page that shows a dual axis solar tracker and its digital twin, live from a
      tracker or simulated in your browser. It is a demo for teaching and is provided as is, without any
      guarantee of availability or uptime. A live tracker is only reachable while someone runs it.
    </p>

    <h2>Your responsibilities</h2>
    <p>
      You agree not to use the service for any unlawful purpose and not to disturb a live tracker or the
      people watching it. The admin tools are for the person who runs the tracker. If you build a tracker
      after this one, you are responsible for its safe construction and use.
    </p>

    <h2>Intellectual property</h2>
    <p>
      The brainSOL software is open source and available under its license on
      <a href="https://github.com/swimmingbrain/brainsol" target="_blank" rel="noopener">GitHub</a>.
    </p>

    <h2>Disclaimer of warranties</h2>
    <p>
      brainSOL is provided "as is" and "as available" without warranties of any kind, whether express
      or implied, including but not limited to implied warranties of merchantability, fitness for a
      particular purpose or non infringement. The figures it shows, simulated or measured, are estimates
      for demonstration and not a basis for planning a real installation.
    </p>

    <h2>Limitation of liability</h2>
    <p>
      To the fullest extent permitted by law, brainSOL and its contributors shall not be liable for
      any indirect, incidental, special, consequential or punitive damages, or any loss of data,
      profits or revenue, whether incurred directly or indirectly, arising from your use of the service.
    </p>

    <h2>Changes</h2>
    <p>
      We reserve the right to modify these terms at any time. Continued use of brainSOL after changes
      constitutes acceptance of the updated terms.
    </p>

    <h2>Contact</h2>
    <p>
      For questions about these terms, contact us via
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

  p a {
    color: var(--accent);
    text-decoration: none;
  }

  p a:hover {
    color: var(--accent-hover);
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
