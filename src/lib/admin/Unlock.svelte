<script lang="ts">
  // a stand in for the unlock dialog until the admin stream replaces this file.
  // the lock icon opens it. in the simulation there is no pin, against a real
  // tracker the pi checks it
  import Dialog from '$lib/ui/Dialog.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { errorText, t } from '$lib/i18n';

  let pin = $state('');
  let busy = $state(false);
  let message = $state('');

  const sim = $derived(connection.source === 'sim');

  function close() {
    ui.unlockOpen = false;
    pin = '';
    message = '';
  }

  async function unlock(e?: SubmitEvent) {
    e?.preventDefault();
    busy = true;
    message = '';
    const result = await connection.auth(sim ? '' : pin);
    busy = false;
    if (result.ok) {
      toast(t('lock.unlocked'), 'success');
      close();
    } else if (result.wait) {
      message = t('lock.wait', { s: result.wait });
    } else {
      message = errorText(result.err);
    }
  }

  function lock() {
    connection.logout();
    toast(t('lock.locked'), 'info');
    close();
  }
</script>

{#if ui.unlockOpen}
  <Dialog title={t('lock.title')} width={360} onclose={close}>
    {#if connection.admin}
      <p class="note">{t('lock.unlocked')}</p>
      <div class="actions">
        <Button variant="secondary" icon="lock" onclick={lock}>{t('lock.lock')}</Button>
      </div>
    {:else if sim}
      <p class="note">{t('lock.simNote')}</p>
      <div class="actions">
        <Button variant="primary" icon="unlock" disabled={busy} onclick={() => unlock()}>{t('lock.open')}</Button>
      </div>
    {:else}
      <form onsubmit={unlock}>
        <p class="note">{t('lock.liveNote')}</p>
        <label class="pin">
          <span>{t('lock.pin')}</span>
          <input type="password" inputmode="numeric" autocomplete="off" bind:value={pin} />
        </label>
        <div class="actions">
          <Button variant="primary" type="submit" icon="unlock" disabled={busy || pin.length === 0}>{t('lock.unlock')}</Button>
        </div>
      </form>
    {/if}
    {#if message}<p class="message">{message}</p>{/if}
  </Dialog>
{/if}

<style>
  .note {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text-secondary);
  }

  .pin {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 14px;
    font-size: 11.5px;
    color: var(--text-secondary);
  }

  .pin input {
    height: 30px;
    padding: 0 8px;
    font-family: var(--font-editor);
    font-size: 14px;
    letter-spacing: 0.2em;
    color: var(--text-primary);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 0;
    outline: none;
  }

  .pin input:focus {
    border-color: var(--accent);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }

  .message {
    margin-top: 10px;
    font-size: 12px;
    color: var(--error);
  }
</style>
