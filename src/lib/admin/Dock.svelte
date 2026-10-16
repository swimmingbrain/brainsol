<script lang="ts">
  // a stand in for the admin dock until the admin stream replaces this file. it
  // only exists while admin tools are open. it shows the way in: commands go
  // out with connection.send, which always resolves with the ack
  import Panel from '$lib/ui/Panel.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Slider from '$lib/ui/Slider.svelte';
  import ToggleField from '$lib/ui/ToggleField.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { errorText, modeName, t } from '$lib/i18n';
  import type { Command, Mode } from '$lib/link/protocol';

  async function run(command: Command) {
    const ack = await connection.send(command);
    if (!ack.ok) toast(errorText(ack.err), 'warning');
  }

  const modes = $derived<{ value: Mode; label: string }[]>([
    { value: 'auto', label: modeName('auto') },
    { value: 'hold', label: modeName('hold') }
  ]);

  const light = $derived(telemetry.sim);

  function moveLight(change: { az?: number; el?: number; on?: boolean }) {
    if (!light) return;
    void run({ op: 'simlight', az: change.az ?? light.az, el: change.el ?? light.el, on: change.on ?? light.on });
  }
</script>

<Panel title={t('section.dock')}>
  <div class="rows">
    <Segmented value={telemetry.mode ?? 'auto'} options={modes} label={t('q.mode')} onchange={(mode) => run({ op: 'mode', mode })} />
    {#if connection.caps?.simlight && light}
      <Field label={t('q.light')}>
        <ToggleField value={light.on} label={t('q.light')} onchange={(on) => moveLight({ on })} />
      </Field>
      <Field label="az">
        <Slider value={light.az} min={-180} max={180} step={1} precision={0} unit="°" label="az" onchange={(az) => moveLight({ az })} />
      </Field>
      <Field label="el">
        <Slider value={light.el} min={0} max={90} step={1} precision={0} unit="°" label="el" onchange={(el) => moveLight({ el })} />
      </Field>
    {/if}
  </div>
</Panel>

<style>
  .rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .rows :global(.field) {
    padding-left: 0;
    padding-right: 0;
  }
</style>
