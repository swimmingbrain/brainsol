<script lang="ts">
  // the day simulator. a clear day at any place, worked out in the browser:
  // what a fixed panel, a single axis and a dual axis tracker get over the
  // day, the energy of each, and the same for the twelve months of a year
  import Section from '$lib/ui/Section.svelte';
  import Field from '$lib/ui/Field.svelte';
  import SelectField from '$lib/ui/SelectField.svelte';
  import NumberField from '$lib/ui/NumberField.svelte';
  import Slider from '$lib/ui/Slider.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Plot, { type PlotSeries, type PlotView } from './chart/Plot.svelte';
  import Bars from './chart/Bars.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { preferences } from '$lib/stores/preferences.svelte';
  import { fmt, t, type Key } from '$lib/i18n';
  import { dateOf, fixedPanelFor, gain, simulateDay, simulateYear } from './solar/day';
  import { gainPercent } from './format';
  import { dayCsv, yearCsv } from './solar/csv';
  import { saveText } from './download';

  interface Preset {
    id: string;
    lat: number;
    lon: number;
  }

  const PRESETS: Preset[] = [
    { id: 'vienna', lat: 48.21, lon: 16.37 },
    { id: 'berlin', lat: 52.52, lon: 13.4 },
    { id: 'madrid', lat: 40.42, lon: -3.7 },
    { id: 'oslo', lat: 59.91, lon: 10.75 },
    { id: 'cairo', lat: 30.04, lon: 31.24 },
    { id: 'nairobi', lat: -1.29, lon: 36.82 },
    { id: 'sydney', lat: -33.87, lon: 151.21 }
  ];

  const tiltFor = (lat: number) => fixedPanelFor(lat).tilt;
  const facingFor = (lat: number) => fixedPanelFor(lat).azimuth;

  const thisYear = new Date().getFullYear();
  function today(): number {
    const now = new Date();
    const start = Date.UTC(now.getFullYear(), 0, 1);
    const day = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 86400_000) + 1;
    return Math.min(365, day);
  }

  let preset = $state('vienna');
  let lat = $state(48.21);
  let lon = $state(16.37);
  let day = $state(today());
  let tilt = $state(tiltFor(48.21));
  let facing = $state(facingFor(48.21));
  // once someone picks a place, the tracker's site no longer takes over
  let touched = $state(false);

  const trackerSite = $derived(connection.config?.site ?? null);

  // the tracker's own site is the starting point when it has one
  $effect(() => {
    const site = trackerSite;
    if (!site || touched) return;
    lat = site.lat;
    lon = site.lon;
    const known = PRESETS.find((p) => Math.abs(p.lat - site.lat) < 0.01 && Math.abs(p.lon - site.lon) < 0.01);
    preset = known ? known.id : 'tracker';
    tilt = tiltFor(site.lat);
    facing = facingFor(site.lat);
  });

  const presetOptions = $derived([
    ...(trackerSite ? [{ value: 'tracker', label: t('panels.day.tracker') }] : []),
    ...PRESETS.map((p) => ({ value: p.id, label: t(`panels.day.city.${p.id}` as Key) })),
    ...(preset === 'custom' ? [{ value: 'custom', label: t('panels.day.custom') }] : [])
  ]);

  function choosePreset(id: string) {
    const place = id === 'tracker' && trackerSite ? { lat: trackerSite.lat, lon: trackerSite.lon } : PRESETS.find((p) => p.id === id);
    if (!place) return;
    touched = true;
    preset = id;
    lat = place.lat;
    lon = place.lon;
    tilt = tiltFor(place.lat);
    facing = facingFor(place.lat);
  }

  function editSite(next: { lat?: number; lon?: number }) {
    touched = true;
    preset = 'custom';
    if (next.lat !== undefined) lat = next.lat;
    if (next.lon !== undefined) lon = next.lon;
  }

  const site = $derived({ lat, lon });
  const panel = $derived({ tilt, azimuth: facing });
  const sim = $derived(simulateDay(site, day, panel, thisYear));
  const year = $derived(simulateYear(site, panel, thisYear));

  // the dates people know: the equinoxes and the solstices
  const MARKS = [
    { day: 79, id: 'march' },
    { day: 172, id: 'june' },
    { day: 265, id: 'september' },
    { day: 355, id: 'december' }
  ];

  const lang = $derived(preferences.lang === 'de' ? 'de-DE' : 'en-GB');
  const dateText = (d: number) => {
    const { month, date } = dateOf(d);
    return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, month, date)));
  };
  const shortDate = (d: number) => {
    const { month, date } = dateOf(d);
    return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, month, date)));
  };
  const monthNames = $derived(
    Array.from({ length: 12 }, (_, m) =>
      new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m, 15))).replace('.', '').slice(0, 3)
    )
  );
  const monthFull = $derived(
    Array.from({ length: 12 }, (_, m) => new Intl.DateTimeFormat(lang, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m, 15))))
  );

  const COMPASS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  const compass = (bearing: number) => t(`panels.day.dir.${COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]}` as Key);

  // hours of solar time as a clock
  const clock = (hours: number) => {
    const total = Math.round(hours * 60);
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const labels = $derived<[string, string, string]>([t('panels.day.fixed'), t('panels.day.single'), t('panels.day.dual')]);

  const series = $derived<PlotSeries[]>([
    { label: labels[0], color: 'series3', unit: 'W/m²', digits: 0 },
    { label: labels[1], color: 'series2', unit: 'W/m²', digits: 0 },
    { label: labels[2], color: 'series1', unit: 'W/m²', digits: 0 }
  ]);

  // the chart shows the hours with sun and one on either side
  const view = $derived<PlotView>({
    data: [sim.hours, sim.fixed, sim.single, sim.dual],
    min: sim.sunrise === null ? 0 : Math.max(0, Math.floor(sim.sunrise) - 1),
    max: sim.sunset === null ? 24 : Math.min(24, Math.ceil(sim.sunset) + 1)
  });

  const daylight = $derived.by(() => {
    if (sim.sunrise === null || sim.sunset === null) return null;
    const minutes = Math.round((sim.sunset - sim.sunrise) * 60);
    return t('panels.day.duration', { h: Math.floor(minutes / 60), m: minutes % 60 });
  });

  const kinds = ['fixed', 'single', 'dual'] as const;

  // the numbers behind the charts, for a spreadsheet
  const placeTag = () => `${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const saveDay = () => saveText(`brainsol-day-${placeTag()}-${day}.csv`, dayCsv(sim));
  const saveYear = () => saveText(`brainsol-year-${placeTag()}.csv`, yearCsv(year));
  const kwh = (value: number) => fmt(value, value >= 100 ? 0 : value >= 10 ? 1 : 2);
  const share = (value: number | null) => (value === null ? null : fmt(Math.round(value * 100), 0));
</script>

<Section id="day" title={t('section.day')} lead={t('panels.day.lead')}>
  <div class="layout">
    <div class="controls">
      <div class="group">
        <h3>{t('panels.day.place')}</h3>
        <Field label={t('panels.day.site')}>
          <SelectField value={preset} options={presetOptions} label={t('panels.day.site')} onchange={choosePreset} />
        </Field>
        <Field label={t('q.lat')}>
          <NumberField value={lat} min={-89.9} max={89.9} step={0.01} precision={2} unit="°" label={t('q.lat')} onchange={(v) => editSite({ lat: v })} />
        </Field>
        <Field label={t('q.lon')}>
          <NumberField value={lon} min={-180} max={180} step={0.01} precision={2} unit="°" label={t('q.lon')} onchange={(v) => editSite({ lon: v })} />
        </Field>
      </div>

      <div class="group">
        <h3>{t('panels.day.dayHead')}</h3>
        <Field label={dateText(day)}>
          <Slider value={day} min={1} max={365} step={1} precision={0} label={t('panels.day.day')} onchange={(v) => (day = v)} />
        </Field>
        <div class="marks">
          {#each MARKS as mark (mark.id)}
            <Button size="sm" variant="ghost" active={day === mark.day} title={t(`panels.day.mark.${mark.id}` as Key)} onclick={() => (day = mark.day)}>
              {shortDate(mark.day)}
            </Button>
          {/each}
        </div>
      </div>

      <div class="group">
        <h3>{t('panels.day.fixedHead')}</h3>
        <Field label={t('panels.day.tilt')}>
          <Slider value={tilt} min={0} max={90} step={1} precision={0} unit="°" label={t('panels.day.tilt')} onchange={(v) => (tilt = v)} />
        </Field>
        <Field label={t('panels.day.facing')}>
          <Slider value={facing} min={0} max={355} step={5} precision={0} unit="°" label={t('panels.day.facing')} onchange={(v) => (facing = v)} />
        </Field>
        <p class="hint">{t('panels.day.fixedHint', { dir: compass(facing), tilt })}</p>
      </div>
    </div>

    <div class="result">
      <div class="figures">
        {#each kinds as kind, i (kind)}
          <div class="figure">
            <span class="label"><span class="swatch" style="background: var(--chart-{i + 1})"></span>{labels[i]}</span>
            <span class="big">{kwh(sim.energy[kind])}<span class="unit">kWh/m²</span></span>
            <span class="gain">
              {#if kind === 'fixed'}
                {t('panels.day.perDayFull')}
              {:else if gain(sim.energy[kind], sim.energy.fixed) !== null}
                {t('panels.day.vsFixed', { g: gainPercent(1 + gain(sim.energy[kind], sim.energy.fixed)!) ?? '' })}
              {:else}
                &nbsp;
              {/if}
            </span>
          </div>
        {/each}
        <div class="facts">
          <span>{t('panels.day.daylight')} <b>{daylight ?? t('panels.day.polar')}</b></span>
          <span>{t('panels.day.highest')} <b>{fmt(Math.max(0, sim.noon), 0)}°</b></span>
        </div>
      </div>
      <div class="save">
        <Button size="sm" variant="ghost" icon="download" onclick={saveDay}>{t('panels.day.saveDay')}</Button>
      </div>
      <Plot
        {series}
        {view}
        x="number"
        xFormat={(v) => clock(v)}
        y={{ min: 0, max: 1100, include: [0, 1100] }}
        height={260}
        hint={t('panels.day.solarTime')}
        label={t('panels.day.chartAria')} />
    </div>
  </div>

  <div class="year">
    <div class="year-head">
      <div class="year-title">
        <h3>{t('panels.day.yearHead')}</h3>
        <Button size="sm" variant="ghost" icon="download" onclick={saveYear}>{t('panels.day.saveYear')}</Button>
      </div>
      <p>
        {t('panels.day.yearLead', { dual: share(gain(year.total.dual, year.total.fixed)) ?? '0', single: share(gain(year.total.single, year.total.fixed)) ?? '0' })}
      </p>
    </div>
    <div class="year-body">
      <Bars
        groups={year.months.map((m) => ({ label: monthNames[m.month], full: monthFull[m.month], values: [m.daily.fixed, m.daily.single, m.daily.dual] }))}
        series={series.map((s) => ({ label: s.label, color: s.color }))}
        unit="kWh/m²"
        idle={t('panels.day.perDay')}
        label={t('panels.day.yearAria')} />
      <div class="totals">
        {#each kinds as kind, i (kind)}
          <div class="total">
            <span class="label"><span class="swatch" style="background: var(--chart-{i + 1})"></span>{labels[i]}</span>
            <span class="mid">{fmt(year.total[kind], 0)}<span class="unit">kWh/m²</span></span>
            {#if kind !== 'fixed'}
              <span class="gain">{t('panels.day.vsFixed', { g: gainPercent(1 + (gain(year.total[kind], year.total.fixed) ?? 0)) ?? '' })}</span>
            {:else}
              <span class="gain">{t('panels.day.perYear')}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>

  <div class="note">
    <h3>{t('panels.day.noteHead')}</h3>
    <div class="note-body">
      <dl class="formulas">
        <dt>{t('panels.day.note.sun')}</dt>
        <dd>{t('panels.day.note.sunText')}</dd>
        <dt>{t('panels.day.note.airmass')}</dt>
        <dd><code>AM = 1 / (cos z + 0.50572 (96.07995 − z)^−1.6364)</code>, {t('panels.day.note.airmassText')}</dd>
        <dt>{t('panels.day.note.beam')}</dt>
        <dd><code>DNI = 1353 · 0.7^(AM^0.678) W/m²</code></dd>
        <dt>{t('panels.day.note.diffuse')}</dt>
        <dd><code>D = 0.1 · DNI</code>, {t('panels.day.note.diffuseText')} <code>D · (1 + cos β) / 2</code></dd>
        <dt>{t('panels.day.note.panel')}</dt>
        <dd><code>G = DNI · max(0, cos θ) + D · (1 + cos β) / 2</code>, {t('panels.day.note.panelText')}</dd>
        <dt>{t('panels.day.note.kinds')}</dt>
        <dd>{t('panels.day.note.kindsText')}</dd>
        <dt>{t('panels.day.note.energy')}</dt>
        <dd>{t('panels.day.note.energyText')}</dd>
      </dl>
      <div class="limits">
        <h4>{t('panels.day.note.limits')}</h4>
        <ul>
          <li>{t('panels.day.note.limit1')}</li>
          <li>{t('panels.day.note.limit2')}</li>
          <li>{t('panels.day.note.limit3')}</li>
          <li>{t('panels.day.note.limit4')}</li>
        </ul>
      </div>
    </div>
  </div>
</Section>

<style>
  .layout {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    gap: 40px;
    align-items: start;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .group :global(.field) {
    padding-left: 0;
    padding-right: 0;
  }

  h3 {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 4px;
  }

  .marks {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin: 2px 0 0 -8px;
  }

  .hint {
    margin-top: 4px;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--text-muted);
  }

  .result {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;
  }

  .figures {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
    gap: 16px 24px;
    align-items: end;
  }

  .figure,
  .total {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .swatch {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .big,
  .mid {
    font-weight: 500;
    color: var(--text-strong);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .big {
    font-size: 26px;
  }

  .mid {
    font-size: 20px;
  }

  .unit {
    margin-left: 4px;
    font-size: 11px;
    letter-spacing: 0;
    color: var(--text-muted);
  }

  .gain {
    font-size: 11.5px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .facts {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11.5px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .facts b {
    font-weight: 500;
    color: var(--text-primary);
  }

  .year {
    margin-top: 44px;
  }

  .save {
    display: flex;
    justify-content: flex-end;
    margin: -10px 0 -6px;
  }

  .year-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    max-width: 100%;
  }

  .year-head p {
    max-width: 640px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-secondary);
  }

  .year-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 220px;
    gap: 40px;
    margin-top: 16px;
    align-items: start;
  }

  .totals {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 24px;
  }

  .note {
    margin-top: 44px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
  }

  .note-body {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 40px;
    margin-top: 8px;
  }

  .formulas {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 8px 16px;
    font-size: 12px;
    line-height: 1.55;
  }

  dt {
    color: var(--text-muted);
  }

  dd {
    color: var(--text-secondary);
  }

  code {
    font-size: 11.5px;
    color: var(--text-primary);
    white-space: nowrap;
  }

  h4 {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 6px;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-left: 16px;
    font-size: 12px;
    line-height: 1.55;
    color: var(--text-secondary);
  }

  @media (max-width: 1000px) {
    .layout,
    .year-body,
    .note-body {
      grid-template-columns: minmax(0, 1fr);
      gap: 24px;
    }

    .totals {
      flex-direction: row;
      flex-wrap: wrap;
      padding-top: 0;
    }
  }

  @media (max-width: 600px) {
    .figures {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .facts {
      grid-column: 1 / -1;
      flex-direction: row;
      gap: 16px;
    }

    .big {
      font-size: 19px;
    }

    .formulas {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }

    .formulas dd {
      margin-bottom: 8px;
    }

    code {
      white-space: normal;
    }
  }
</style>
