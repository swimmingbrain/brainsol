<script lang="ts">
  // where the page gets its data: the tracker address with a test before
  // switching, the way back to the simulation and a qr code that brings the
  // audience to the same tracker
  import Group from '../parts/Group.svelte';
  import Note from '../parts/Note.svelte';
  import QrCode from '../parts/QrCode.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { fmt, t, type Key } from '$lib/i18n';
  import { checkAddress, isLocalPage, probeTracker, shareLink, type Probe } from '../share';

  const page = typeof location === 'undefined' ? { protocol: 'https:', host: '', origin: '', hostname: '' } : location;

  let input = $state(connection.address ?? '');
  let testing = $state(false);
  let probe = $state<Probe | null>(null);
  let linkEl = $state<HTMLElement | null>(null);

  const check = $derived(checkAddress(input, page));
  const live = $derived(connection.source === 'live');
  const waiting = $derived(connection.status === 'connecting' || connection.status === 'reconnecting');
  const hello = $derived(connection.hello);

  // config.json says where the page goes without ?pi=, the share link leaves that out
  const link = $derived(shareLink(page.origin, connection.address, connection.defaultAddress ?? '', page));
  const local = $derived(isLocalPage(page.hostname));

  async function test() {
    if (check.kind !== 'ok') return;
    testing = true;
    probe = null;
    probe = await probeTracker(check.http);
    testing = false;
  }

  function save() {
    if (check.kind === 'sim') {
      useSim();
      return;
    }
    if (check.kind !== 'ok') return;
    // a new tracker means new rights, the dock closes until it is unlocked there
    connection.connect(input.trim(), { save: true });
  }

  function useSim() {
    connection.useSim({ save: true });
    toast(t('link.simChosen'), 'info');
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast(t('admin.link.copied'), 'success');
    } catch {
      // no clipboard without https or permission, the text is selected for a manual copy
      const range = document.createRange();
      if (linkEl) range.selectNodeContents(linkEl);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      toast(t('admin.link.copyManual'), 'info', 5000);
    }
  }

  const problem = $derived(connection.problem ? t(`status.${connection.problem}` as Key, { host: connection.host ?? '' }) : null);
</script>

<Group title={t('admin.link.now')}>
  <dl class="facts">
    <dt>{t('admin.link.source')}</dt>
    <dd>
      <Chip tone={live ? (waiting ? 'warning' : 'success') : connection.problem ? 'warning' : 'neutral'} dot>
        {live ? t('top.live') : t('top.sim')}
      </Chip>
    </dd>
    <dt>{t('admin.link.where')}</dt>
    <dd class="mono">{live ? (connection.host ?? '') : t('admin.link.browser')}</dd>
    {#if hello}
      <dt>{t('admin.link.tracker')}</dt>
      <dd class="mono">{hello.name} {hello.version}, {t(`admin.sys.drv.${hello.driver}` as Key)}</dd>
    {/if}
    <dt>{t('admin.link.status')}</dt>
    <dd>{t(`admin.link.status.${connection.status}` as Key)}</dd>
    {#if live && connection.latency !== null}
      <dt>{t('admin.link.latency')}</dt>
      <dd class="mono">{fmt(connection.latency, 0)} ms</dd>
    {/if}
  </dl>
  {#if problem}
    <Note tone="warn">{problem}</Note>
  {/if}
</Group>

<Group title={t('admin.link.address')} hint={t('admin.link.addressHint')}>
  <div class="address">
    <input
      id="admin-address"
      type="text"
      bind:value={input}
      placeholder={t('admin.link.placeholder')}
      aria-label={t('admin.link.address')}
      aria-describedby="admin-address-check"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      enterkeyhint="go"
      onkeydown={(e) => e.key === 'Enter' && check.kind === 'ok' && test()}
      oninput={() => (probe = null)} />
  </div>
  <div id="admin-address-check" aria-live="polite">
    {#if check.kind === 'mixed'}
      <Note tone="warn">{t('admin.link.mixed', { host: check.host })}</Note>
      <div class="fixes">
        <Button size="sm" icon="external" href={check.page}>{t('admin.link.openServed', { host: check.host })}</Button>
      </div>
    {:else if check.kind === 'invalid'}
      <Note tone="warn">{t('admin.link.invalid')}</Note>
    {:else if check.kind === 'ok'}
      <p class="resolved">{t('admin.link.resolved', { ws: check.ws })}</p>
    {:else if check.kind === 'sim'}
      <p class="resolved">{t('admin.link.isSim')}</p>
    {/if}
    {#if probe}
      {#if probe.ok}
        <Note tone="ok">
          {t('admin.link.answers', { name: probe.info.name, version: probe.info.version, driver: t(`admin.sys.drv.${probe.info.driver}` as Key), n: probe.info.viewers })}
        </Note>
      {:else}
        <Note tone="warn">{t(`admin.link.probe.${probe.reason}` as Key)}</Note>
      {/if}
    {/if}
  </div>
  <div class="actions">
    <Button size="sm" icon="signal" disabled={check.kind !== 'ok' || testing} onclick={test}>
      {testing ? t('admin.link.testing') : t('admin.link.test')}
    </Button>
    <Button size="sm" variant="primary" icon="save" disabled={check.kind !== 'ok' && check.kind !== 'sim'} onclick={save}>{t('admin.link.save')}</Button>
    <Button size="sm" variant="ghost" icon="cube" disabled={!live && !connection.address} onclick={useSim}>{t('admin.link.sim')}</Button>
  </div>
</Group>

<Group title={t('admin.link.share')} hint={t('admin.link.shareHint')}>
  <div class="share">
    <QrCode text={link} label={t('admin.link.qr')} />
    <div class="link">
      <code bind:this={linkEl} class="url">{link}</code>
      <Button size="sm" icon="copy" onclick={copy}>{t('admin.link.copy')}</Button>
    </div>
  </div>
  {#if local}
    <Note tone="warn">{t('admin.link.local')}</Note>
  {/if}
</Group>

<style>
  .facts {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr);
    gap: 6px 6px;
    align-items: center;
    margin: 0;
    font-size: 12.5px;
  }

  dt {
    font-size: 12px;
    color: var(--text-secondary);
  }

  dd {
    margin: 0;
    min-width: 0;
    color: var(--text-primary);
    overflow-wrap: anywhere;
  }

  .mono {
    font-size: 12px;
  }

  .address input {
    width: 100%;
    height: 30px;
    padding: 0 8px;
    font-size: 12.5px;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    outline: none;
  }

  .address input:focus {
    border-color: var(--accent-ink);
  }

  .address input::placeholder {
    color: var(--text-muted);
  }

  .resolved {
    font-size: 11px;
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }

  .fixes {
    margin-top: 6px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .share {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .link {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
  }

  .url {
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--text-primary);
    overflow-wrap: anywhere;
    user-select: all;
  }

  @container dock (max-width: 380px) {
    .share {
      flex-direction: column;
      align-items: center;
    }

    .link {
      align-items: center;
      text-align: center;
    }
  }

  @media (pointer: coarse) {
    .address input {
      height: 44px;
      font-size: 15px;
    }
  }
</style>
