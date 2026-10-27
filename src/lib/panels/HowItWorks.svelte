<script lang="ts">
  // how it works, for the talk: four steps from the sensors to the reason
  // tracking pays, each with a small sketch that moves with the tracker, then
  // two short comparisons with the other ways to point a panel
  import Section from '$lib/ui/Section.svelte';
  import ShadeWall from './how/ShadeWall.svelte';
  import ErrorScale from './how/ErrorScale.svelte';
  import Servos from './how/Servos.svelte';
  import CosineLaw from './how/CosineLaw.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { fmt, t, type Key } from '$lib/i18n';
  import { errorTangents } from '$lib/sim/controller';
  import { fixedPanelFor, gain, simulateYear } from './solar/day';
  import { angle, gainPercent, roughAngle } from './format';

  const k = $derived(connection.config?.baffle ?? 1.2);

  // where the light is across the panel, from left right error alone
  const across = $derived.by(() => {
    if (telemetry.ex === null) return null;
    if (telemetry.st === 'lowlight') return t('panels.how.now.dark');
    const deg = (Math.atan(errorTangents(telemetry.ex, 0, k).tx) * 180) / Math.PI;
    const rough = roughAngle(deg)!;
    if (rough.under) return t('panels.how.now.ahead');
    return t(deg > 0 ? 'panels.how.now.right' : 'panels.how.now.left', { a: rough.value });
  });

  const errorNow = $derived(
    telemetry.ex === null ? null : t('panels.how.now.error', { ex: fmt(telemetry.ex, 3) ?? '', ey: fmt(telemetry.ey, 3) ?? '' })
  );
  const poseNow = $derived(
    telemetry.pan === null ? null : t('panels.how.now.pose', { pan: angle(telemetry.pan) ?? '', tilt: angle(telemetry.tilt) ?? '' })
  );
  const shareNow = $derived.by(() => {
    if (telemetry.off === null) return null;
    const rough = roughAngle(telemetry.off)!;
    const share = Math.cos((telemetry.off * Math.PI) / 180) * 100;
    return t(rough.under ? 'panels.how.now.shareUnder' : 'panels.how.now.share', { a: rough.value, p: fmt(share, share > 99.5 ? 1 : 0) ?? '' });
  });

  const steps = $derived([
    { id: 'sensors', now: across },
    { id: 'error', now: errorNow },
    { id: 'servos', now: poseNow },
    { id: 'cosine', now: shareNow }
  ]);

  // the clear sky year of the day simulator for the site of the tracker
  const site = $derived(connection.config?.site ?? { lat: 48.21, lon: 16.37 });
  const year = $derived(simulateYear(site, fixedPanelFor(site.lat)));
  const place = $derived(connection.config?.site ? t('panels.how.cmp.here') : t('panels.day.city.vienna'));
  const single = $derived(gainPercent(1 + (gain(year.total.single, year.total.fixed) ?? 0)));
  const dual = $derived(gainPercent(1 + (gain(year.total.dual, year.total.fixed) ?? 0)));

  const sensorRows = ['source', 'needs', 'clouds', 'mechanics', 'use', 'mode'];
  const axisRows = ['parts', 'angle', 'gain', 'cost', 'space', 'use'];
</script>

<Section id="how" title={t('section.how')} lead={t('panels.how.lead')}>
  <ol class="steps">
    {#each steps as step, i (step.id)}
      <li class="step">
        <div class="sketch">
          {#if step.id === 'sensors'}<ShadeWall />{:else if step.id === 'error'}<ErrorScale />{:else if step.id === 'servos'}<Servos />{:else}<CosineLaw />{/if}
        </div>
        <div class="head">
          <span class="num">{i + 1}</span>
          <h3>{t(`panels.how.${step.id}.title` as Key)}</h3>
        </div>
        <p>{t(`panels.how.${step.id}.text` as Key)}</p>
        <p class="now">{step.now ?? ' '}</p>
      </li>
    {/each}
  </ol>

  <div class="compare">
    <div class="table">
      <h3>{t('panels.how.cmp.sensorTitle')}</h3>
      <table style="--cols: 2">
        <thead>
          <tr>
            <th class="corner"></th>
            <th>{t('panels.how.cmp.sensors')}</th>
            <th>{t('panels.how.cmp.astro')}</th>
          </tr>
        </thead>
        <tbody>
          {#each sensorRows as row (row)}
            <tr>
              <th scope="row">{t(`panels.how.cmp.s.${row}` as Key)}</th>
              <td>{t(`panels.how.cmp.s.${row}.a` as Key)}</td>
              <td>{t(`panels.how.cmp.s.${row}.b` as Key)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="table">
      <h3>{t('panels.how.cmp.axisTitle')}</h3>
      <table style="--cols: 3">
        <thead>
          <tr>
            <th class="corner"></th>
            <th>{t('panels.day.fixed')}</th>
            <th>{t('panels.day.single')}</th>
            <th>{t('panels.day.dual')}</th>
          </tr>
        </thead>
        <tbody>
          {#each axisRows as row (row)}
            <tr>
              {#if row === 'gain'}
                <th scope="row">{t('panels.how.cmp.a.gain', { place })}</th>
                <td>{t('panels.how.cmp.a.gain.a')}</td>
                <td class="num-cell">{single} %</td>
                <td class="num-cell">{dual} %</td>
              {:else}
                <th scope="row">{t(`panels.how.cmp.a.${row}` as Key)}</th>
                <td>{t(`panels.how.cmp.a.${row}.a` as Key)}</td>
                <td>{t(`panels.how.cmp.a.${row}.b` as Key)}</td>
                <td>{t(`panels.how.cmp.a.${row}.c` as Key)}</td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="foot">{t('panels.how.cmp.foot')}</p>
    </div>
  </div>
</Section>

<style>
  .steps {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 32px;
  }

  .step {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .sketch {
    padding: 10px 12px 6px;
    margin-bottom: 14px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    font-family: var(--font-editor);
    font-size: 11px;
    color: var(--on-accent);
    background: var(--accent);
  }

  h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .step p {
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-secondary);
  }

  .step .now {
    margin-top: auto;
    padding-top: 10px;
    font-family: var(--font-editor);
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-muted);
  }

  .compare {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
    gap: 40px;
    margin-top: 52px;
  }

  .table h3 {
    margin-bottom: 12px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
    line-height: 1.5;
  }

  thead th {
    padding: 0 10px 8px 0;
    font-size: 11.5px;
    font-weight: 600;
    text-align: left;
    color: var(--text-primary);
    border-bottom: 1px solid var(--border);
  }

  tbody th {
    width: 26%;
    padding: 8px 10px 8px 0;
    font-weight: 400;
    text-align: left;
    vertical-align: top;
    color: var(--text-muted);
  }

  td {
    padding: 8px 10px 8px 0;
    vertical-align: top;
    color: var(--text-secondary);
  }

  tbody tr {
    border-bottom: 1px solid var(--border);
  }

  .num-cell {
    font-family: var(--font-editor);
    color: var(--text-strong);
  }

  .foot {
    margin-top: 10px;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--text-muted);
  }

  @media (max-width: 1100px) {
    .steps {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .compare {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 600px) {
    .steps {
      grid-template-columns: minmax(0, 1fr);
      gap: 28px;
    }

    /* on a phone each row gets its label on a line of its own and the
       values side by side under it, so no column is squeezed to a few letters */
    table {
      font-size: 12px;
    }

    tr {
      display: grid;
      grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
      column-gap: 10px;
    }

    .corner {
      display: none;
    }

    tbody th {
      grid-column: 1 / -1;
      width: auto;
      padding-bottom: 2px;
    }

    td {
      padding-top: 0;
    }
  }
</style>
