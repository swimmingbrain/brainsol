<script lang="ts">
  // one slider per tunable the tracker reports in its config, grouped the way
  // the loop uses them. nothing here knows a range, all of it comes with the config
  import Group from '../parts/Group.svelte';
  import Note from '../parts/Note.svelte';
  import ParamRow from '../parts/ParamRow.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { t, type Key } from '$lib/i18n';
  import type { Param, ParamKey } from '$lib/link/protocol';
  import { setCommand } from '../commands';
  import { defaultValue, groupsOf, isDefault, resetOrder } from '../params';
  import { runner } from '../session.svelte';

  const params = $derived((connection.config?.params ?? null) as Record<string, Param> | null);
  const groups = $derived(groupsOf(params));
  const noSet = $derived(runner.unsupported('set'));
  const changed = $derived(params ? Object.keys(params).filter((key) => !isDefault(key, params[key])) : []);

  let resetting = $state(false);

  // one after the other, in an order the tracker accepts
  async function resetAll() {
    if (!params) return;
    resetting = true;
    for (const key of resetOrder(changed, params)) {
      const value = defaultValue(key, params[key]);
      if (value === null) continue;
      const ack = await runner.run(setCommand(key as ParamKey, value), { key: 'set.all', feature: 'set' });
      if (!ack.ok) break;
    }
    resetting = false;
  }
</script>

{#if !params}
  <Group title={t('admin.tab.tuning')}>
    <Note>{t('admin.tune.waiting')}</Note>
  </Group>
{:else}
  {#each groups as group (group.id)}
    <Group title={t(`admin.tune.group.${group.id}` as Key)} hint={t(`admin.tune.group.${group.id}.hint` as Key)}>
      {#each group.keys as key (key)}
        <ParamRow {key} param={params[key]} {params} disabled={noSet || resetting} />
      {/each}
    </Group>
  {/each}
  <Group title={t('admin.tune.all')}>
    <div class="all">
      <Button size="sm" icon="undo" disabled={changed.length === 0 || noSet || resetting} onclick={resetAll}>
        {t('admin.tune.resetAll')}
      </Button>
      <span class="count">{changed.length === 0 ? t('admin.tune.allDefault') : t('admin.tune.changed', { n: changed.length })}</span>
    </div>
    {#if noSet}
      <Note tone="warn">{t('admin.tune.unsupported')}</Note>
    {:else}
      <Note>{t('admin.tune.kept')}</Note>
    {/if}
  </Group>
{/if}

<style>
  .all {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .count {
    font-size: 12px;
    color: var(--text-muted);
  }
</style>
