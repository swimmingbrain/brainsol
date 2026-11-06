<script lang="ts">
  import Logo from './Logo.svelte';
  import Icon from './Icon.svelte';
  import Chip from './Chip.svelte';
  import Segmented from './Segmented.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { preferences, type Lang } from '$lib/stores/preferences.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { fmt, t } from '$lib/i18n';

  const live = $derived(connection.source === 'live');
  const waiting = $derived(connection.status === 'connecting' || connection.status === 'reconnecting');

  const sourceTone = $derived(live ? (waiting ? 'warning' : 'success') : connection.problem ? 'warning' : 'neutral');

  const sourceTitle = $derived(
    live
      ? waiting
        ? t('top.connectingTitle', { host: connection.host ?? '' })
        : t('top.liveTitle', { host: connection.host ?? '' })
      : t('top.simTitle')
  );

  const viewers = $derived(telemetry.sys?.viewers ?? null);

  const languages = $derived<{ value: Lang; label: string; title: string }[]>([
    { value: 'en', label: 'EN', title: t('lang.en') },
    { value: 'de', label: 'DE', title: t('lang.de') }
  ]);
</script>

<header class="topbar">
  <div class="left">
    <a class="logo" href="/" title={t('app.tagline')} data-sveltekit-reload>
      <span class="logo-icon"><Logo size={20} /></span>
      <span class="logo-text">brainSOL</span>
    </a>
    <span class="separator"></span>
    <!-- until the page knows where its data comes from it claims neither -->
    {#if connection.status !== 'idle'}
      <Chip tone={sourceTone} dot pulse={waiting} title={sourceTitle}>
        {live ? t('top.live') : t('top.sim')}
      </Chip>
    {/if}
    {#if viewers !== null}
      <span class="viewers" title={t('top.viewers')}>
        <Icon name="eye" size={13} />
        <span>{fmt(viewers)}</span>
      </span>
    {/if}
  </div>

  <div class="actions">
    <div class="lang">
      <Segmented
        size="sm"
        label={t('top.language')}
        value={preferences.lang}
        options={languages}
        onchange={(lang) => preferences.setLang(lang)} />
    </div>
    <button
      class="action-btn"
      onclick={() => preferences.toggleTheme()}
      title={preferences.theme === 'dark' ? t('top.themeToLight') : t('top.themeToDark')}
      aria-label={preferences.theme === 'dark' ? t('top.themeToLight') : t('top.themeToDark')}>
      <Icon name={preferences.theme === 'dark' ? 'sun' : 'moon'} size={14} />
    </button>
    <button
      class="action-btn"
      class:on={ui.presenting}
      onclick={() => ui.togglePresenting()}
      title={t('top.present')}
      aria-label={t('top.present')}>
      <Icon name="expand" size={14} />
    </button>
    <span class="separator"></span>
    <button
      class="action-btn"
      class:on={connection.admin}
      onclick={() => (ui.unlockOpen = true)}
      title={connection.admin ? t('top.unlocked') : t('top.lock')}
      aria-label={connection.admin ? t('top.unlocked') : t('top.lock')}>
      <Icon name={connection.admin ? 'unlock' : 'lock'} size={14} />
    </button>
  </div>
</header>

<style>
  .topbar {
    height: var(--topbar-h);
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    flex-shrink: 0;
    gap: 10px;
  }

  .left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    user-select: none;
    text-decoration: none;
  }

  .logo-icon {
    display: flex;
    align-items: center;
    color: var(--accent);
  }

  .logo-text {
    font-size: 16px;
    color: var(--text-primary);
  }

  .viewers {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .lang {
    width: 68px;
    margin-right: 4px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: var(--text-secondary);
  }

  .action-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .action-btn.on {
    background: var(--accent-dim);
    color: var(--accent-ink);
  }

  .separator {
    width: 1px;
    height: 16px;
    background: var(--border);
    margin: 0 3px;
    flex-shrink: 0;
  }

  @media (max-width: 420px) {
    .viewers {
      display: none;
    }
  }

  @media (max-width: 370px) {
    .logo-text {
      display: none;
    }
  }
</style>
