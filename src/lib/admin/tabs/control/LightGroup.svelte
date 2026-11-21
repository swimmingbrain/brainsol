<script lang="ts">
  // the light of a simulated tracker: where it is, how bright it is and how
  // much light comes from everywhere else. only a tracker with caps.simlight
  // has one. dragging sends at most eight updates a second, the audience sees
  // the light glide
  import Group from '../../parts/Group.svelte';
  import Note from '../../parts/Note.svelte';
  import LogSlider from '../../parts/LogSlider.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Slider from '$lib/ui/Slider.svelte';
  import ToggleField from '$lib/ui/ToggleField.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { t } from '$lib/i18n';
  import type { SimLight } from '$lib/link/protocol';
  import { AMBIENT_MAX, LIGHT_MAX, sceneCommand, simlightCommand, type SceneName } from '../../commands';
  import { debounce, throttle } from '../../timing';
  import { runner } from '../../session.svelte';

  // what is being dragged, on top of what the tracker reports
  let draft = $state<Partial<SimLight>>({});
  const light = $derived<SimLight | null>(telemetry.sim ? { ...telemetry.sim, ...draft } : null);

  // the sun moves the light in sun mode and the sun of the plan in plan mode, the tracker would answer busy
  const sunMode = $derived(telemetry.mode === 'sun');
  const planMode = $derived(telemetry.mode === 'plan');
  const off = $derived(!light || sunMode || planMode || runner.unsupported('simlight'));

  const send = throttle((next: SimLight) => {
    void runner.run(simlightCommand(next), { key: 'simlight' });
  }, 120);

  const settle = debounce(() => (draft = {}), 900);

  function change(part: Partial<SimLight>, done: boolean) {
    if (!telemetry.sim) return;
    draft = { ...draft, ...part };
    send.call({ ...telemetry.sim, ...draft });
    if (done) send.flush();
    settle.call();
  }

  function scene(name: SceneName) {
    if (!telemetry.sim) return;
    send.cancel();
    settle.cancel();
    draft = {};
    void runner.run(sceneCommand(name, telemetry.sim), { key: `scene.${name}`, feature: 'simlight' });
  }

  $effect(() => () => {
    send.cancel();
    settle.cancel();
  });
</script>

<Group title={t('admin.group.light')} hint={t('admin.light.hint')}>
  {#if light}
    <div class="fields">
      <Field label={t('admin.light.on')}>
        <ToggleField value={light.on} label={t('admin.light.on')} disabled={off} onchange={(on) => change({ on }, true)} />
      </Field>
      <Field label={t('admin.light.az')} hint={t('admin.light.azHint')}>
        <Slider
          value={light.az}
          min={-180}
          max={180}
          step={1}
          precision={0}
          unit="°"
          label={t('admin.light.az')}
          disabled={off}
          oninput={(az) => change({ az }, false)}
          onchange={(az) => change({ az }, true)} />
      </Field>
      <Field label={t('admin.light.el')} hint={t('admin.light.elHint')}>
        <Slider
          value={light.el}
          min={0}
          max={90}
          step={1}
          precision={0}
          unit="°"
          label={t('admin.light.el')}
          disabled={off}
          oninput={(el) => change({ el }, false)}
          onchange={(el) => change({ el }, true)} />
      </Field>
      <Field label={t('admin.light.lux')} hint={t('admin.light.luxHint')}>
        <LogSlider
          value={light.lux}
          min={10}
          max={LIGHT_MAX}
          unit=" lx"
          label={t('admin.light.lux')}
          disabled={off}
          oninput={(lux) => change({ lux }, false)}
          onchange={(lux) => change({ lux }, true)} />
      </Field>
      <Field label={t('admin.light.amb')} hint={t('admin.light.ambHint')}>
        <LogSlider
          value={light.amb}
          min={1}
          max={AMBIENT_MAX}
          unit=" lx"
          label={t('admin.light.amb')}
          disabled={off}
          oninput={(amb) => change({ amb }, false)}
          onchange={(amb) => change({ amb }, true)} />
      </Field>
    </div>
    <div class="scenes" role="group" aria-label={t('admin.light.scenes')}>
      <Button size="sm" icon="lamp" disabled={off || runner.pending('scene.phone')} title={t('admin.light.phoneTitle')} onclick={() => scene('phone')}>
        {t('admin.light.phone')}
      </Button>
      <Button size="sm" icon="sun" disabled={off || runner.pending('scene.sun')} title={t('admin.light.sunTitle')} onclick={() => scene('sun')}>
        {t('admin.light.sun')}
      </Button>
    </div>
    {#if sunMode}
      <Note>{t('admin.light.sunMode')}</Note>
    {:else if planMode}
      <Note>{t('admin.light.planMode')}</Note>
    {:else if runner.unsupported('simlight')}
      <Note tone="warn">{t('admin.light.unsupported')}</Note>
    {/if}
  {:else}
    <Note>{t('admin.light.waiting')}</Note>
  {/if}
</Group>

<style>
  .fields {
    margin: 0 -8px;
  }

  .scenes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }

  .scenes :global(.btn) {
    width: 100%;
  }
</style>
