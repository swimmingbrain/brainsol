<script lang="ts">
  // manual moves: the joystick for steering by hand, two sliders for an exact
  // target and a few poses worth showing. each of them puts the tracker into
  // manual mode, the mode switch above shows that as soon as it happens
  import Group from '../../parts/Group.svelte';
  import Note from '../../parts/Note.svelte';
  import Joystick from '../../parts/Joystick.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Slider from '$lib/ui/Slider.svelte';
  import Stat from '$lib/ui/Stat.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { errorText, fmt, t, type Key } from '$lib/i18n';
  import type { Pose } from '$lib/link/protocol';
  import { FALLBACK_LIMITS, POSE_NAMES, quickPose, rateCommand, targetCommand, type PoseName } from '../../commands';
  import { debounce, throttle } from '../../timing';
  import { runner } from '../../session.svelte';
  import type { Vec } from '../../stick';

  const limits = $derived(connection.config?.limits ?? FALLBACK_LIMITS);
  const live = $derived<Pose | null>(telemetry.pan !== null && telemetry.tilt !== null ? { pan: telemetry.pan, tilt: telemetry.tilt } : null);

  // what the sliders show: the pose being dragged, else the target the tracker
  // holds, else where the head is right now
  let draft = $state<Pose | null>(null);
  const shown = $derived<Pose>(draft ?? telemetry.tgt ?? live ?? { pan: 0, tilt: 90 });

  const noRate = $derived(runner.unsupported('rate'));
  const noTarget = $derived(runner.unsupported('target'));

  let lastWarn = 0;
  function warn(err: string) {
    // a joystick sends ten commands a second, one note is enough
    const now = Date.now();
    if (now - lastWarn < 4000) return;
    lastWarn = now;
    toast(errorText(err), 'warning', 4000);
  }

  async function rate(v: Vec) {
    const ack = await runner.run(rateCommand(v.x, v.y), { key: 'rate', track: false, quiet: true });
    if (!ack.ok) warn(ack.err);
  }

  const sendTarget = throttle((pose: Pose) => {
    void runner.run(targetCommand(pose, limits), { key: 'target' });
  }, 150);

  // once the hand is off the slider it follows the tracker again
  const settle = debounce(() => (draft = null), 900);

  function steer(change: Partial<Pose>, done: boolean) {
    draft = { ...shown, ...change };
    sendTarget.call(draft);
    if (done) sendTarget.flush();
    settle.call();
  }

  function pose(name: PoseName) {
    settle.cancel();
    draft = null;
    void runner.run(targetCommand(quickPose(name, limits), limits), { key: `pose.${name}`, feature: 'target' });
  }

  $effect(() => () => {
    sendTarget.cancel();
    settle.cancel();
  });
</script>

<Group title={t('admin.group.move')} hint={t('admin.move.hint')}>
  <div class="steer">
    <Joystick label={t('admin.stick.label')} disabled={noRate} onrate={rate} />
    <div class="now">
      <Stat label={t('q.pan')} value={telemetry.pan} digits={1} unit="°" size="sm" />
      <Stat label={t('q.tilt')} value={telemetry.tilt} digits={1} unit="°" size="sm" />
      <Stat
        label={t('admin.move.target')}
        value={null}
        size="sm"
        text={telemetry.tgt ? `${fmt(telemetry.tgt.pan, 1)}° / ${fmt(telemetry.tgt.tilt, 1)}°` : t('admin.move.noTarget')} />
    </div>
  </div>
  {#if noRate}
    <Note tone="warn">{t('admin.move.noRate')}</Note>
  {/if}

  <div class="fields">
    <Field label={t('q.pan')}>
      <Slider
        value={shown.pan}
        min={limits.pan[0]}
        max={limits.pan[1]}
        step={1}
        precision={1}
        unit="°"
        label={t('admin.move.targetPan')}
        disabled={noTarget}
        oninput={(pan) => steer({ pan }, false)}
        onchange={(pan) => steer({ pan }, true)} />
    </Field>
    <Field label={t('q.tilt')}>
      <Slider
        value={shown.tilt}
        min={limits.tilt[0]}
        max={limits.tilt[1]}
        step={1}
        precision={1}
        unit="°"
        label={t('admin.move.targetTilt')}
        disabled={noTarget}
        oninput={(tilt) => steer({ tilt }, false)}
        onchange={(tilt) => steer({ tilt }, true)} />
    </Field>
  </div>

  <div class="poses" role="group" aria-label={t('admin.move.poses')}>
    {#each POSE_NAMES as name (name)}
      <Button
        size="sm"
        disabled={noTarget || runner.pending(`pose.${name}`)}
        title={t(`admin.pose.${name}.title` as Key)}
        onclick={() => pose(name)}>
        {t(`admin.pose.${name}` as Key)}
      </Button>
    {/each}
  </div>
  {#if noTarget}
    <Note tone="warn">{t('admin.move.noTargets')}</Note>
  {/if}
</Group>

<style>
  .steer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 112px;
    gap: 12px;
    align-items: start;
  }

  .now {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 4px;
  }

  .fields {
    margin: 0 -8px;
  }

  .poses {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 4px;
  }

  .poses :global(.btn) {
    width: 100%;
    min-width: 0;
    padding: 0 4px;
  }

  .poses :global(.btn span) {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (pointer: coarse) {
    .steer {
      grid-template-columns: 1fr;
      justify-items: center;
    }

    .now {
      flex-direction: row;
      justify-content: space-around;
      width: 100%;
    }

    .poses {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .poses :global(.btn) {
      height: 44px;
      font-size: 13px;
    }
  }
</style>
