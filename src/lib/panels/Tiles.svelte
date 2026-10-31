<script lang="ts">
  // the key numbers of the tracker as quiet tiles. where the panel looks, how
  // much light it gets, what that is worth and what the loop is doing
  import Panel from '$lib/ui/Panel.svelte';
  import Tile from './Tile.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { modeName, stateWord, t } from '$lib/i18n';
  import { azEl, normal } from '$lib/sim/kinematics';
  import { angle, gainPercent, lux, percent, power, roughAngle } from './format';
  import type { St } from '$lib/link/protocol';

  // the servo angles say little on their own, past tilt 90 the panel looks
  // backwards. the tiles show where the panel normal points
  const facing = $derived.by(() => {
    if (telemetry.pan === null || telemetry.tilt === null) return null;
    return azEl(normal(telemetry.pan, telemetry.tilt));
  });

  // lux from the light sensor when the tracker has one, the mean level otherwise
  const hasLux = $derived(connection.caps ? connection.caps.lux : telemetry.lux !== null);
  const watts = $derived(power(telemetry.pmw));
  const off = $derived(roughAngle(telemetry.off));

  const tones: Partial<Record<St, 'success' | 'warning' | 'error'>> = {
    locked: 'success',
    lowlight: 'warning',
    limit: 'warning',
    fault: 'error'
  };
</script>

<Panel title={t('section.tiles')}>
  <div class="tiles">
    <Tile
      label={t('panels.tiles.azimuth')}
      title={t('panels.tiles.azimuthTitle')}
      value={angle(facing?.az)}
      unit="°"
      caption={telemetry.pan !== null ? t('panels.tiles.pan', { v: angle(telemetry.pan) ?? '' }) : ''} />
    <Tile
      label={t('panels.tiles.elevation')}
      title={t('panels.tiles.elevationTitle')}
      value={angle(facing?.el)}
      unit="°"
      caption={telemetry.tilt !== null ? t('panels.tiles.tilt', { v: angle(telemetry.tilt) ?? '' }) : ''} />
    {#if hasLux}
      <Tile label={t('panels.tiles.light')} title={t('panels.tiles.lightTitle')} value={lux(telemetry.lux)} unit="lx" caption={t('panels.tiles.luxNote')} />
    {:else}
      <Tile label={t('panels.tiles.level')} title={t('panels.tiles.levelTitle')} value={percent(telemetry.lvl)} unit="%" caption={t('panels.tiles.levelNote')} />
    {/if}
    <Tile
      label={t('panels.tiles.power')}
      title={connection.caps?.pv ? t('panels.tiles.measuredTitle') : t('panels.tiles.estimatedTitle', { eff: Math.round((connection.config?.panel.eff ?? 0.15) * 100) })}
      value={watts?.value ?? null}
      unit={watts?.unit ?? ''}
      tag={connection.caps?.pv ? t('panels.tiles.measured') : t('panels.tiles.estimated')} />
    <Tile
      label={t('panels.tiles.gain')}
      title={t('panels.tiles.gainTitle', { pan: connection.config?.params.ref_pan.v ?? 0, tilt: connection.config?.params.ref_tilt.v ?? 90 })}
      value={gainPercent(telemetry.gain)}
      unit="%"
      caption={t('panels.tiles.gainNote')} />
    <Tile
      label={t('q.off')}
      title={t('panels.tiles.offTitle')}
      value={off ? String(off.value) : null}
      before={off ? (off.under ? t('panels.tiles.under') : t('panels.tiles.about')) : ''}
      unit="°"
      caption={t('panels.tiles.offNote')} />
    <Tile
      wide
      word
      label={t('q.state')}
      value={telemetry.st ? stateWord(telemetry.st) : null}
      dot={telemetry.st ? (tones[telemetry.st] ?? 'neutral') : null}
      caption={telemetry.mode ? t('panels.tiles.mode', { mode: modeName(telemetry.mode) }) : ''} />
  </div>
</Panel>

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 16px;
  }
</style>
