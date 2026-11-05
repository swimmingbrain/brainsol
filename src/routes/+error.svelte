<script lang="ts">
  import { page } from '$app/state';
  import Logo from '$lib/ui/Logo.svelte';
  import { t } from '$lib/i18n';

  const missing = $derived(page.status === 404);
</script>

<svelte:head>
  <title>{missing ? 'Not found' : 'Error'} | brainSOL</title>
</svelte:head>

<div class="error-page">
  <div class="error-content">
    <span class="error-icon"><Logo size={40} /></span>
    <h1>{page.status}</h1>
    <p>{missing ? t('error.missing') : page.error?.message}</p>
    <a href="/" data-sveltekit-reload>&larr; {t('error.back')}</a>
  </div>
</div>

<style>
  .error-page {
    height: 100vh;
    height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
    background: var(--bg-deep);
  }

  .error-content {
    text-align: center;
  }

  .error-icon {
    display: flex;
    justify-content: center;
    margin-bottom: 16px;
    color: var(--accent);
  }

  h1 {
    font-size: 28px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  p {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 24px;
  }

  a {
    font-size: 12px;
    color: var(--text-muted);
    text-decoration: none;
  }

  a:hover {
    color: var(--accent);
  }
</style>
