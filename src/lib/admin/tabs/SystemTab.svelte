<script lang="ts">
  // the machine behind the tracker: live figures from the once a second sys
  // frame, the event log for admins, recording to a csv and the power buttons
  import Group from '../parts/Group.svelte';
  import Note from '../parts/Note.svelte';
  import ConfirmDialog from '../parts/ConfirmDialog.svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Field from '$lib/ui/Field.svelte';
  import ToggleField from '$lib/ui/ToggleField.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { t, type Key } from '$lib/i18n';
  import type { SysAction } from '$lib/link/protocol';
  import type { IconName } from '$lib/ui/Icon.svelte';
  import { recCommand, sysCommand } from '../commands';
  import { clockTime, uptimeText } from '../format';
  import { recordUrl } from '../record';
  import { runner } from '../session.svelte';

  const sys = $derived(telemetry.sys);
  const live = $derived(connection.source === 'live');
  const units = $derived({ d: t('admin.sys.unit.d'), h: 'h', min: 'min', s: 's' });

  const ACTIONS: { action: SysAction; icon: IconName }[] = [
    { action: 'restart', icon: 'refresh' },
    { action: 'reboot', icon: 'power' },
    { action: 'shutdown', icon: 'power' }
  ];

  // asked about right now, null while no dialog is open
  let asking = $state<SysAction | null>(null);

  // the csv exists once something was recorded in this visit or the tracker records now
  let recorded = $state(false);

  const token = $derived(connection.token);
  const csv = $derived(live && connection.api && token && (recorded || sys?.rec) ? recordUrl(connection.api, token) : null);

  async function record(on: boolean) {
    const ack = await runner.run(recCommand(on), { key: 'rec' });
    if (ack.ok && on) recorded = true;
  }

  function power(action: SysAction) {
    void runner.run(sysCommand(action), { key: `sys.${action}`, feature: `sys.${action}` });
  }

  const events = $derived([...telemetry.events].reverse());
</script>

<Group title={t('admin.sys.now')} hint={sys ? undefined : t('admin.sys.waiting')}>
  <div class="stats">
    <Stat size="sm" label={t('admin.sys.cpu')} value={sys?.cpu} unit="%" />
    <Stat size="sm" label={t('admin.sys.temp')} value={sys?.temp} digits={1} unit="°C" />
    <Stat size="sm" label={t('admin.sys.mem')} value={sys?.mem} unit="%" />
    <Stat size="sm" label={t('admin.sys.up')} value={null} text={sys ? uptimeText(sys.up, units) : null} />
    <Stat size="sm" label={t('admin.sys.hz')} value={sys?.hz} digits={1} unit="Hz" />
    <Stat size="sm" label={t('admin.sys.jit')} value={sys?.jit} digits={2} unit="ms" />
    <Stat size="sm" label={t('admin.sys.drv')} value={null} text={sys ? t(`admin.sys.drv.${sys.drv}` as Key) : null} />
    <Stat
      size="sm"
      label={t('admin.sys.link')}
      value={null}
      tone={sys?.link === 'down' ? 'error' : 'plain'}
      text={sys ? t(sys.link === 'ok' ? 'admin.sys.link.ok' : 'admin.sys.link.down') : null} />
    <Stat size="sm" label={t('admin.sys.fw')} value={null} text={sys ? (sys.fw ?? t('admin.sys.noFw')) : null} />
    <Stat size="sm" label={t('admin.sys.viewers')} value={sys?.viewers} />
    <Stat size="sm" label={t('admin.sys.admins')} value={sys?.admins} />
    <Stat size="sm" label={t('admin.sys.act')} value={null} text={sys ? t(`admin.sys.act.${sys.act ?? 'none'}` as Key) : null} />
  </div>
</Group>

<Group title={t('admin.sys.record')} hint={t('admin.sys.recordHint')}>
  <div class="fields">
    <Field label={t('admin.sys.recordOn')}>
      <ToggleField
        value={sys?.rec ?? false}
        label={t('admin.sys.recordOn')}
        disabled={!sys || runner.pending('rec') || runner.unsupported('rec')}
        onchange={record} />
      {#if sys?.rec}<span class="rec"><i></i>{t('admin.sys.recording')}</span>{/if}
    </Field>
  </div>
  {#if csv}
    <div>
      <Button size="sm" icon="download" href={csv}>{t('admin.sys.download')}</Button>
    </div>
  {:else if !live}
    <Note>{t('admin.sys.csvLive')}</Note>
  {/if}
  {#if runner.unsupported('rec')}
    <Note tone="warn">{t('admin.sys.noRec')}</Note>
  {/if}
</Group>

<Group title={t('admin.sys.events')} hint={t('admin.sys.eventsHint')}>
  {#if events.length === 0}
    <Note>{t('admin.sys.noEvents')}</Note>
  {:else}
    <ol class="log" aria-label={t('admin.sys.events')}>
      {#each events as event, i (`${event.ts}-${i}`)}
        <li class="event {event.lvl}">
          <time>{clockTime(event.ts)}</time>
          <span class="dot" title={t(`admin.sys.lvl.${event.lvl}` as Key)}></span>
          <span class="msg">{event.msg}</span>
        </li>
      {/each}
    </ol>
  {/if}
</Group>

<Group title={t('admin.sys.power')} hint={t('admin.sys.powerHint')}>
  <div class="power">
    {#each ACTIONS as { action, icon } (action)}
      <Button
        size="sm"
        variant={action === 'restart' ? 'secondary' : 'danger'}
        {icon}
        disabled={!live || runner.pending(`sys.${action}`) || runner.unsupported(`sys.${action}`)}
        onclick={() => (asking = action)}>
        {t(`admin.sys.${action}` as Key)}
      </Button>
    {/each}
  </div>
  {#if !live}
    <Note>{t('admin.sys.powerSim')}</Note>
  {:else if ACTIONS.some(({ action }) => runner.unsupported(`sys.${action}`))}
    <Note tone="warn">{t('admin.sys.powerMissing')}</Note>
  {/if}
</Group>

{#if asking}
  {@const action = asking}
  <ConfirmDialog
    title={t(`admin.sys.${action}.ask` as Key)}
    message={t(`admin.sys.${action}.what` as Key)}
    confirm={t(`admin.sys.${action}` as Key)}
    icon={action === 'restart' ? 'refresh' : 'power'}
    onconfirm={() => power(action)}
    onclose={() => (asking = null)} />
{/if}

<style>
  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px 10px;
  }

  .fields {
    margin: 0 -8px;
  }

  .rec {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-left: 10px;
    font-size: 11px;
    color: var(--error);
  }

  .rec i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--error);
    animation: pulse 1.5s infinite;
  }

  .log {
    display: flex;
    flex-direction: column;
    max-height: 260px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
    border: 1px solid var(--border);
    background: var(--bg-deep);
  }

  .event {
    display: grid;
    grid-template-columns: auto 6px minmax(0, 1fr);
    align-items: baseline;
    gap: 8px;
    padding: 4px 8px;
    font-size: 11px;
    line-height: 1.45;
    border-top: 1px solid var(--border);
  }

  .event:first-child {
    border-top: none;
  }

  time {
    font-family: var(--font-editor);
    font-size: 10.5px;
    color: var(--text-muted);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
    align-self: center;
  }

  .warn .dot {
    background: var(--warning);
  }

  .error .dot {
    background: var(--error);
  }

  .msg {
    font-family: var(--font-editor);
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  }

  .power {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
</style>
