<script lang="ts">
  // the last minutes as live charts. four views of the stream, each with one
  // or two plots that share a time axis and never mix two units on one axis.
  // a plot is built the first time its tab opens and then only fed, and only
  // the open tab is fed at all
  import Panel from '$lib/ui/Panel.svelte';
  import PanelTabs from '$lib/ui/PanelTabs.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Plot, { type PlotSeries, type PlotView, type RangeSpec } from './chart/Plot.svelte';
  import { history } from '$lib/stores/history.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { fmt, t } from '$lib/i18n';
  import { windowData, type Column } from './chart/window';
  import { gainPercent, lux } from './format';

  type TabId = 'light' | 'angles' | 'error' | 'power';

  interface PlotSpec {
    id: string;
    series: PlotSeries[];
    columns: Column[];
    y: RangeSpec;
    lines?: number[];
  }

  let tab = $state<TabId>('light');
  let minutes = $state<1 | 5 | 10>(1);
  let hovering = $state(false);
  // tabs that were open once keep their plots
  let opened = $state<TabId[]>(['light']);

  const signed = (value: number, digits: number) => {
    const text = fmt(value, digits);
    if (text === null) return null;
    return value > 0 && Number(text.replace(',', '.')) !== 0 ? `+${text}` : text;
  };

  const hasLux = $derived(connection.caps ? connection.caps.lux : true);

  const tabs = $derived<Record<TabId, PlotSpec[]>>({
    light: [
      ...(hasLux
        ? [
            {
              id: 'lux',
              series: [{ label: t('q.light'), color: 'series1', unit: 'lx', format: (v) => lux(v) }],
              columns: [{ col: 'lux' }],
              y: { include: [0], minSpan: 10 }
            } satisfies PlotSpec
          ]
        : []),
      {
        id: 'level',
        series: [{ label: t('panels.charts.level'), color: 'series2', unit: '%', digits: 0 }],
        columns: [{ col: 'lvl', map: (v) => v * 100 }],
        y: { min: 0, max: 100, include: [0, 100] }
      }
    ],
    angles: [
      {
        id: 'angles',
        series: [
          { label: t('q.pan'), color: 'series1', unit: '°', digits: 1 },
          { label: t('q.tilt'), color: 'series2', unit: '°', digits: 1 }
        ],
        columns: [{ col: 'pan' }, { col: 'tilt' }],
        y: { minSpan: 10 }
      }
    ],
    error: [
      {
        id: 'error',
        series: [
          { label: 'ex', color: 'series1', format: (v) => signed(v, 3) },
          { label: 'ey', color: 'series2', format: (v) => signed(v, 3) }
        ],
        columns: [{ col: 'ex' }, { col: 'ey' }],
        y: { symmetric: true, minSpan: 0.2 },
        lines: [0]
      },
      {
        id: 'off',
        series: [{ label: t('panels.tiles.off'), color: 'series3', unit: '°', digits: 1 }],
        columns: [{ col: 'off' }],
        y: { min: 0, include: [0], minSpan: 5 }
      }
    ],
    power: [
      {
        id: 'power',
        series: [{ label: t('panels.tiles.power'), color: 'series1', unit: 'mW', digits: 1 }],
        columns: [{ col: 'pmw' }],
        y: { min: 0, include: [0], minSpan: 1 }
      },
      {
        id: 'gain',
        series: [{ label: t('panels.tiles.gain'), color: 'series2', unit: '%', format: (v) => gainPercent(1 + v / 100) }],
        columns: [{ col: 'gain', map: (v) => (v - 1) * 100 }],
        y: { include: [0], minSpan: 10 },
        lines: [0]
      }
    ]
  });

  const tabList = $derived([
    { id: 'light', label: t('panels.charts.light') },
    { id: 'angles', label: t('panels.charts.angles') },
    { id: 'error', label: t('panels.charts.error') },
    { id: 'power', label: t('panels.charts.power') }
  ]);

  const windows = $derived([
    { value: '1', label: t('panels.charts.minutes', { n: 1 }) },
    { value: '5', label: t('panels.charts.minutes', { n: 5 }) },
    { value: '10', label: t('panels.charts.minutes', { n: 10 }) }
  ]);

  function choose(id: string) {
    tab = id as TabId;
    hovering = false;
    if (!opened.includes(tab)) opened = [...opened, tab];
  }

  // one plot alone gets the room of two
  const heightOf = (count: number) => (count > 1 ? 96 : 180);

  // the window of a plot, read only by a plot that is open and not paused
  function viewOf(spec: PlotSpec): PlotView {
    void history.version;
    return windowData(history.ring, spec.columns, minutes * 60);
  }
</script>

<Panel title={t('section.charts')} flush>
  {#snippet right()}
    <div class="window">
      <Segmented
        size="sm"
        value={String(minutes)}
        options={windows}
        label={t('panels.charts.window')}
        onchange={(v) => (minutes = Number(v) as 1 | 5 | 10)} />
    </div>
  {/snippet}
  <PanelTabs tabs={tabList} active={tab} onchange={choose} />
  <div class="body">
    {#each opened as id (id)}
      <div class="tab" hidden={id !== tab}>
        {#each tabs[id] as spec (spec.id)}
          <Plot
            series={spec.series}
            view={id === tab ? viewOf(spec) : null}
            y={spec.y}
            lines={spec.lines}
            height={heightOf(tabs[id].length)}
            sync="live-{id}"
            live
            active={id === tab}
            paused={hovering}
            onhover={(on) => (hovering = on)}
            hint={hovering ? '' : t('panels.charts.now')}
            label={spec.series.map((s) => s.label).join(', ')} />
        {/each}
      </div>
    {/each}
  </div>
</Panel>

<style>
  .window {
    width: 156px;
  }

  .body {
    padding: 8px 12px 12px;
  }

  .tab {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tab[hidden] {
    display: none;
  }
</style>
