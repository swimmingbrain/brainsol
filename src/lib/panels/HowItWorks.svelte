<script lang="ts">
  // how it works, for the talk: four steps from the sensors to the reason
  // tracking pays, each with a small sketch that moves with the tracker
  import Section from '$lib/ui/Section.svelte';
  import ShadeWall from './how/ShadeWall.svelte';
  import ErrorScale from './how/ErrorScale.svelte';
  import Servos from './how/Servos.svelte';
  import CosineLaw from './how/CosineLaw.svelte';
  import { telemetry } from '$lib/stores/telemetry.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { fmt, t, type Key } from '$lib/i18n';
  import { errorTangents } from '$lib/sim/controller';
  import { angle, roughAngle, signed } from './format';

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
    telemetry.ex === null ? null : t('panels.how.now.error', { ex: signed(telemetry.ex, 3) ?? '', ey: signed(telemetry.ey, 3) ?? '' })
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
    font-size: 11.5px;
    color: var(--on-accent);
    background: var(--accent);
  }

  h3 {
    font-size: 16.5px;
    color: var(--text-strong);
  }

  .step p {
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--text-secondary);
  }

  .step .now {
    margin-top: auto;
    padding-top: 10px;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--text-muted);
  }

  @media (max-width: 1100px) {
    .steps {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 600px) {
    .steps {
      grid-template-columns: minmax(0, 1fr);
      gap: 28px;
    }
  }
</style>
