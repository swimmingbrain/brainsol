<script lang="ts">
  // the guided calibration for the day the hardware arrives: dark, bright,
  // centre, directions, save. each step says what to do and what came out.
  // nothing is kept on the tracker until the last step saves it
  import Group from '../parts/Group.svelte';
  import Note from '../parts/Note.svelte';
  import SensorBars from '../parts/SensorBars.svelte';
  import CalibStep from '../parts/CalibStep.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { errorText, t, type Key } from '$lib/i18n';
  import type { AckMessage, CalibStep as Step } from '$lib/link/protocol';
  import { calibCommand, FALLBACK_LIMITS, targetCommand } from '../commands';
  import { FLOW, nearFlat, nextStep, polarityTilt, rawNow, readPolarity, readSpan, readZero, sensorsWhere, type FlowStep } from '../calib';
  import { runner, session, type StepResult } from '../session.svelte';
  import type { IconName } from '$lib/ui/Icon.svelte';

  const ICONS: Record<FlowStep, IconName> = { dark: 'moon', bright: 'lamp', zero: 'target', polarity: 'refresh', save: 'save' };

  const noCalib = $derived(runner.unsupported('calib'));
  const busy = $derived(FLOW.some((step) => session.calib[step]?.state === 'running') || runner.pending('calib.reset'));
  const next = $derived(nextStep(FLOW.filter((step) => session.calib[step]?.state === 'done')));
  const limits = $derived(connection.config?.limits ?? FALLBACK_LIMITS);
  const band = $derived(connection.config?.params?.zenith_band?.v ?? 6);
  const flat = $derived(nearFlat(telemetry.tilt, band));

  // the start of a polarity run whose ack did not come in time
  let watching = $state<number | null>(null);
  let sawCalib = false;

  function trackerSays(ack: AckMessage): string | undefined {
    // the python tracker adds its own sentence in msg, it is not in protocol.ts
    const msg = (ack as { msg?: unknown }).msg;
    return typeof msg === 'string' && msg ? msg : undefined;
  }

  function bars(report: ReturnType<typeof readSpan>, step: 'dark' | 'bright') {
    // the tracker answers with both captures, else the bars take this moment
    if (report) {
      session.dark = report.dark;
      session.bright = report.bright;
      return;
    }
    const now = rawNow(telemetry.raw);
    if (step === 'dark') session.dark = now;
    else session.bright = now;
  }

  function success(step: Step, data: unknown): StepResult {
    switch (step) {
      case 'dark': {
        bars(readSpan(data), 'dark');
        return { state: 'done', note: t('admin.calib.dark.done') };
      }
      case 'bright': {
        const report = readSpan(data);
        bars(report, 'bright');
        if (!report) return { state: 'done', note: t('admin.calib.bright.done') };
        const weak = sensorsWhere(report.weak);
        if (weak.length > 0) return { state: 'done', tone: 'warn', note: t('admin.calib.bright.weak', { names: weak.join(', ') }) };
        const inverted = sensorsWhere(report.inverted);
        if (inverted.length > 0) return { state: 'done', tone: 'info', note: t('admin.calib.bright.inverted', { names: inverted.join(', ') }) };
        return { state: 'done', note: t('admin.calib.bright.good') };
      }
      case 'zero': {
        const zero = readZero(data);
        return { state: 'done', note: zero ? t('admin.calib.zero.done', { pan: zero.pan_us, tilt: zero.tilt_us }) : t('admin.calib.zero.plain') };
      }
      case 'polarity': {
        const sign = readPolarity(data);
        if (!sign) return { state: 'done', note: t('admin.calib.polarity.plain') };
        const word = (s: number) => t(s === 1 ? 'admin.calib.normal' : 'admin.calib.reversed');
        return { state: 'done', note: t('admin.calib.polarity.done', { pan: word(sign.sx), tilt: word(sign.sy) }) };
      }
      case 'save':
        return { state: 'done', note: t('admin.calib.save.done') };
      default:
        return { state: 'done', note: t('admin.calib.reset.done') };
    }
  }

  async function run(step: FlowStep) {
    session.calib[step] = { state: 'running' };
    const started = Date.now();
    const ack = await runner.run(calibCommand(step), { key: `calib.${step}`, feature: 'calib', quiet: true });
    if (ack.ok) {
      session.calib[step] = success(step, ack.data);
      return;
    }
    // the page gives up on an ack after five seconds, the polarity step can take
    // longer. the end of the activity in sys tells when it is over
    if (ack.err === 'timeout' && step === 'polarity') {
      watching = started;
      sawCalib = false;
      // the tracker gives up on a step after a minute, so does the page
      setTimeout(() => {
        if (session.calib.polarity?.state !== 'running') return;
        session.calib.polarity = { state: 'unclear', tone: 'info', note: t('admin.calib.polarity.unclear') };
      }, 65_000);
      return;
    }
    toast(errorText(ack.err), 'warning', 4000);
    // a tracker that cannot calibrate gets one note above the steps, not one per step
    if (ack.err === 'unsupported' || ack.err === 'unknown') {
      delete session.calib[step];
      return;
    }
    session.calib[step] = {
      state: 'failed',
      note: ack.err === 'busy' ? t('admin.calib.busy') : t(`admin.calib.${step}.failed` as Key),
      detail: trackerSays(ack)
    };
  }

  $effect(() => {
    if (watching === null) return;
    const act = telemetry.sys?.act ?? null;
    if (act === 'calib') {
      sawCalib = true;
      return;
    }
    if (!sawCalib) return;
    // the step is over, the newest event of the tracker says how it went
    const since = watching;
    const event = [...telemetry.events].reverse().find((e) => e.ts * 1000 >= since - 1000);
    watching = null;
    if (!event) session.calib.polarity = { state: 'unclear', tone: 'info', note: t('admin.calib.polarity.unclear') };
    else if (event.lvl === 'info') session.calib.polarity = { state: 'done', note: t('admin.calib.polarity.plain'), detail: event.msg };
    else session.calib.polarity = { state: 'failed', note: t('admin.calib.polarity.failed'), detail: event.msg };
  });

  async function reset() {
    const ack = await runner.run(calibCommand('reset'), { key: 'calib.reset', feature: 'calib' });
    if (!ack.ok) return;
    session.calib = {};
    const report = readSpan(ack.data);
    session.dark = report?.dark ?? null;
    session.bright = report?.bright ?? null;
  }

  // small moves for the centre step, one degree at a time from the target or the pose
  function nudge(dpan: number, dtilt: number) {
    const base = telemetry.tgt ?? (telemetry.pan !== null && telemetry.tilt !== null ? { pan: telemetry.pan, tilt: telemetry.tilt } : null);
    if (!base) return;
    void runner.run(targetCommand({ pan: base.pan + dpan, tilt: base.tilt + dtilt }, limits), { key: 'nudge', feature: 'target' });
  }

  function centre() {
    void runner.run(targetCommand({ pan: 0, tilt: 90 }, limits), { key: 'nudge', feature: 'target' });
  }

  function tiltAway() {
    const pan = telemetry.tgt?.pan ?? telemetry.pan ?? 0;
    void runner.run(targetCommand({ pan, tilt: polarityTilt(telemetry.tilt, band, limits.tilt) }, limits), { key: 'nudge', feature: 'target' });
  }
</script>

<Group title={t('admin.calib.sensors')} hint={t('admin.calib.sensorsHint')}>
  <SensorBars raw={telemetry.raw} dark={session.dark} bright={session.bright} />
</Group>

<Group title={t('admin.calib.steps')} hint={t('admin.calib.stepsHint')}>
  {#if noCalib}
    <Note tone="warn">{t('admin.calib.unsupported')}</Note>
  {/if}
  <ol class="steps">
    {#each FLOW as step, i (step)}
      <CalibStep
        n={i + 1}
        title={t(`admin.calib.${step}.title` as Key)}
        text={t(`admin.calib.${step}.text` as Key)}
        action={t(`admin.calib.${step}.action` as Key)}
        icon={ICONS[step]}
        result={session.calib[step]}
        next={step === next}
        disabled={noCalib || busy || (step === 'polarity' && flat)}
        onrun={() => run(step)}>
        {#snippet extra()}
          {#if step === 'zero'}
            <div class="nudge" role="group" aria-label={t('admin.calib.nudge')}>
              <Button size="sm" icon="arrowLeft" label={t('admin.calib.nudgeLeft')} title={t('admin.calib.nudgeLeft')} disabled={busy} onclick={() => nudge(-1, 0)} />
              <Button size="sm" icon="arrowRight" label={t('admin.calib.nudgeRight')} title={t('admin.calib.nudgeRight')} disabled={busy} onclick={() => nudge(1, 0)} />
              <Button size="sm" icon="arrowUp" label={t('admin.calib.nudgeUp')} title={t('admin.calib.nudgeUp')} disabled={busy} onclick={() => nudge(0, 1)} />
              <Button size="sm" icon="arrowDown" label={t('admin.calib.nudgeDown')} title={t('admin.calib.nudgeDown')} disabled={busy} onclick={() => nudge(0, -1)} />
              <Button size="sm" icon="target" disabled={busy} onclick={centre}>{t('admin.calib.toCentre')}</Button>
            </div>
          {:else if step === 'polarity' && flat}
            <Note tone="warn">{t('admin.calib.polarity.flat')}</Note>
            <div class="nudge">
              <Button size="sm" icon="panel" disabled={busy} onclick={tiltAway}>{t('admin.calib.tiltAway')}</Button>
            </div>
          {/if}
        {/snippet}
      </CalibStep>
    {/each}
  </ol>
</Group>

<Group title={t('admin.calib.resetTitle')} hint={t('admin.calib.resetHint')}>
  <div>
    <Button size="sm" icon="undo" disabled={noCalib || busy} onclick={reset}>{t('admin.calib.reset.action')}</Button>
  </div>
</Group>

<style>
  .steps {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
  }

  .nudge {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  @media (pointer: coarse) {
    .nudge :global(.btn) {
      height: 40px;
      min-width: 40px;
    }
  }
</style>
