<script lang="ts">
  // sun mode: where the tracker stands, which way its front faces and how fast
  // the simulated day runs. a speed or a date starts sun mode, the site only
  // changes the settings
  import Group from '../../parts/Group.svelte';
  import Note from '../../parts/Note.svelte';
  import Field from '$lib/ui/Field.svelte';
  import NumberField from '$lib/ui/NumberField.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { fmt, t, type Key } from '$lib/i18n';
  import type { SunSpeed } from '$lib/link/protocol';
  import { isIsoDate, modeCommand, siteCommand, SUN_SPEEDS, sunCommand, type Site } from '../../commands';
  import { runner, session } from '../../session.svelte';

  let draft = $state<Site | null>(null);
  const site = $derived<Site | null>(draft ?? connection.config?.site ?? null);
  const valid = $derived(site !== null && siteCommand(site) !== null);

  const noSite = $derived(runner.unsupported('site'));
  const noSun = $derived(runner.unsupported('sun'));

  function edit(part: Partial<Site>) {
    if (!site) return;
    draft = { ...site, ...part };
  }

  async function save() {
    if (!site) return;
    const command = siteCommand(site);
    if (!command) return;
    const ack = await runner.run(command, { key: 'site' });
    // the cfg push brings the saved site back, the fields follow it again
    if (ack.ok) draft = null;
  }

  // some trackers switch to sun mode on their own when the clock is set, the
  // mode command makes sure
  async function run(speed: SunSpeed, date?: string) {
    session.sunSpeed = speed;
    const ack = await runner.run(sunCommand(speed, date), { key: 'sun' });
    if (ack.ok && telemetry.mode !== 'sun') await runner.run(modeCommand('sun'), { key: 'mode', feature: 'mode.sun' });
  }

  const speeds = $derived(
    SUN_SPEEDS.map((speed) => ({
      value: String(speed) as `${SunSpeed}`,
      // no thousands mark, 3600× has to fit a quarter of the row
      label: `${speed}×`,
      title: t(`admin.sun.speed.${speed}` as Key)
    }))
  );

  const sunText = $derived.by(() => {
    const sun = telemetry.sun;
    if (!sun) return t('admin.sun.none');
    if (sun.el < 0) return t('admin.sun.below');
    return t('admin.sun.at', { az: fmt(sun.az, 0) ?? '', el: fmt(sun.el, 0) ?? '' });
  });
</script>

<Group title={t('admin.group.sun')} hint={t('admin.sun.hint')}>
  <Stat label={t('admin.sun.now')} value={null} size="sm" text={sunText} />

  <div class="row">
    <span class="label" id="admin-sun-speed">{t('admin.sun.speed')}</span>
    <Segmented
      value={String(session.sunSpeed) as `${SunSpeed}`}
      options={speeds}
      label={t('admin.sun.speed')}
      disabled={noSun || runner.pending('sun')}
      onchange={(value) => run(Number(value) as SunSpeed)} />
  </div>

  <div class="row">
    <label class="label" for="admin-sun-date">{t('admin.sun.date')}</label>
    <div class="date">
      <input id="admin-sun-date" type="date" bind:value={session.sunDate} disabled={noSun} />
      <Button
        size="sm"
        icon="calendar"
        disabled={noSun || !isIsoDate(session.sunDate) || runner.pending('sun')}
        onclick={() => run(session.sunSpeed, session.sunDate)}>
        {t('admin.sun.go')}
      </Button>
    </div>
  </div>
  {#if noSun}
    <Note tone="warn">{t('admin.sun.unsupported')}</Note>
  {/if}

  {#if site}
    <div class="fields">
      <Field label={t('q.lat')}>
        <NumberField value={site.lat} min={-90} max={90} step={0.01} precision={2} unit="°" label={t('q.lat')} disabled={noSite} onchange={(lat) => edit({ lat })} />
      </Field>
      <Field label={t('q.lon')}>
        <NumberField value={site.lon} min={-180} max={180} step={0.01} precision={2} unit="°" label={t('q.lon')} disabled={noSite} onchange={(lon) => edit({ lon })} />
      </Field>
      <Field label={t('q.heading')} hint={t('admin.sun.headingHint')}>
        <NumberField value={site.heading} min={0} max={359} step={1} precision={0} unit="°" label={t('q.heading')} disabled={noSite} onchange={(heading) => edit({ heading })} />
      </Field>
    </div>
    <div class="actions">
      <Button size="sm" variant="ghost" disabled={!draft} onclick={() => (draft = null)}>{t('admin.sun.undo')}</Button>
      <Button size="sm" icon="pin" disabled={!draft || !valid || noSite || runner.pending('site')} onclick={save}>{t('admin.sun.save')}</Button>
    </div>
    {#if noSite}
      <Note tone="warn">{t('admin.sun.noSite')}</Note>
    {/if}
  {/if}
</Group>

<style>
  .row {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr);
    align-items: center;
    gap: 6px;
  }

  .label {
    font-size: 11.5px;
    color: var(--text-secondary);
  }

  /* four speeds in the narrow dock, 3600× must not be cut */
  .row :global(.segment) {
    padding: 0 3px;
  }

  .date {
    display: flex;
    gap: 4px;
    min-width: 0;
  }

  .date input {
    flex: 1;
    min-width: 0;
    height: 22px;
    padding: 0 6px;
    font-family: var(--font-editor);
    font-size: 11.5px;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid transparent;
    border-bottom-color: var(--border);
    border-radius: 0;
    outline: none;
    color-scheme: inherit;
  }

  .date input:focus {
    border-color: var(--accent);
  }

  .date input:disabled {
    opacity: 0.4;
  }

  .fields {
    margin: 0 -8px;
  }

  .fields :global(.field-control) {
    max-width: 120px;
    margin-left: auto;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
  }

  @media (pointer: coarse) {
    .date input {
      height: 40px;
      font-size: 14px;
    }

    .actions :global(.btn),
    .date :global(.btn) {
      height: 40px;
    }
  }
</style>
