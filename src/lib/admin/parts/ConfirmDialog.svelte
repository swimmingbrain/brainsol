<script lang="ts">
  import Dialog from '$lib/ui/Dialog.svelte';
  import Button from '$lib/ui/Button.svelte';
  import type { IconName } from '$lib/ui/Icon.svelte';
  import { t } from '$lib/i18n';
  import { portal } from '../portal';

  // asks once before something that cannot be taken back. the title and the
  // button name the action, cancel comes first so enter does not fire it
  let {
    title,
    message,
    confirm,
    icon,
    onconfirm,
    onclose
  }: {
    title: string;
    message: string;
    confirm: string;
    icon?: IconName;
    onconfirm: () => void;
    onclose: () => void;
  } = $props();

  function apply() {
    onconfirm();
    onclose();
  }
</script>

<div class="confirm" use:portal>
  <Dialog {title} description={message} width={400} {onclose}>
    {#snippet footer()}
      <Button variant="secondary" size="lg" onclick={onclose}>{t('common.cancel')}</Button>
      <Button variant="danger" size="lg" {icon} onclick={apply}>{confirm}</Button>
    {/snippet}
  </Dialog>
</div>

<style>
  .confirm :global(.btn.danger:focus-visible) {
    outline: 2px solid var(--text-strong);
    outline-offset: 1px;
  }
</style>
