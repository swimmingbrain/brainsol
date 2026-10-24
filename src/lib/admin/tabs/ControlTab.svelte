<script lang="ts">
  import Group from '../parts/Group.svelte';
  import Note from '../parts/Note.svelte';
  import ModeSwitch from '../parts/ModeSwitch.svelte';
  import MoveGroup from './control/MoveGroup.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { MODES, type Mode } from '$lib/link/protocol';
  import { modeName, t, type Key } from '$lib/i18n';
  import { modeCommand } from '../commands';
  import { runner } from '../session.svelte';

  // the mode asked for, until the telemetry shows it or the ack says no
  let wanted = $state<Mode | null>(null);
  let giveUp: ReturnType<typeof setTimeout> | null = null;

  const current = $derived(telemetry.mode);
  const missing = $derived(MODES.filter((mode) => runner.unsupported(`mode.${mode}`)));

  $effect(() => {
    if (wanted !== null && current === wanted) wanted = null;
  });

  $effect(() => () => {
    if (giveUp) clearTimeout(giveUp);
  });

  async function pick(mode: Mode) {
    wanted = mode;
    if (giveUp) clearTimeout(giveUp);
    // an activity can keep the mode from showing, the pulse must not run forever
    giveUp = setTimeout(() => (wanted = null), 4000);
    const ack = await runner.run(modeCommand(mode), { key: 'mode', feature: `mode.${mode}` });
    if (!ack.ok && wanted === mode) wanted = null;
  }
</script>

<Group title={t('admin.group.mode')}>
  <ModeSwitch {current} {wanted} unsupported={(mode) => runner.unsupported(`mode.${mode}`)} onpick={pick} />
  <p class="about" aria-live="polite">
    {current ? t(`admin.mode.about.${current}` as Key) : t('admin.mode.waiting')}
  </p>
  {#if missing.length > 0}
    <Note tone="warn">{t('admin.mode.missing', { modes: missing.map(modeName).join(', ') })}</Note>
  {/if}
</Group>

<MoveGroup />

<style>
  .about {
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-secondary);
  }
</style>
