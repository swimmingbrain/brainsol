<script lang="ts">
  // the dialog behind the lock icon. against a tracker it asks for the pin, the
  // pi checks it and locks the pin for a while after too many wrong tries. in the
  // simulation there is nothing to protect, one button opens the tools
  import { untrack } from 'svelte';
  import Dialog from '$lib/ui/Dialog.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { connection } from '$lib/stores/connection.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { errorText, t } from '$lib/i18n';
  import { tick, waitText } from './countdown';

  let pin = $state('');
  let busy = $state(false);
  let wrong = $state(false);
  // wrong pins the tracker still takes before it locks, when it says so
  let tries = $state<number | null>(null);
  let failure = $state('');
  // seconds the pin stays locked, and whether a lock just ran out
  let left = $state(0);
  let freed = $state(false);
  let input = $state<HTMLInputElement | null>(null);

  const sim = $derived(connection.source === 'sim');
  const ready = $derived(connection.status === 'open');
  const host = $derived(connection.host ?? '');
  const locked = $derived(left > 0);

  $effect(() => {
    if (!ui.unlockOpen) return;
    const until = connection.lockedUntil;
    // the callback writes left, it must not become a dependency of this effect
    return untrack(() =>
      tick(until, (seconds) => {
        if (left > 0 && seconds === 0) {
          freed = true;
          queueMicrotask(() => input?.focus());
        }
        left = seconds;
      })
    );
  });

  function close() {
    ui.unlockOpen = false;
    pin = '';
    wrong = false;
    tries = null;
    failure = '';
    freed = false;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy || locked || !ready || pin.length === 0) return;
    busy = true;
    wrong = false;
    failure = '';
    freed = false;
    const result = await connection.auth(pin);
    busy = false;
    if (result.ok) {
      toast(t('admin.unlock.opened'), 'success');
      close();
      return;
    }
    pin = '';
    tries = null;
    // a wait comes with the try that set off the lock, the countdown says it all.
    // a tracker without a pin refuses every pin, that is no typing mistake
    if (!result.wait) {
      if (result.noPin) failure = t('admin.unlock.noPin');
      else if (result.err === 'pin') {
        wrong = true;
        tries = result.left ?? null;
      } else failure = errorText(result.err);
    }
    queueMicrotask(() => input?.focus());
  }

  async function openSim() {
    busy = true;
    failure = '';
    const result = await connection.auth('');
    busy = false;
    if (result.ok) {
      toast(t('admin.unlock.opened'), 'success');
      close();
    } else {
      failure = errorText(result.err);
    }
  }

  function lock() {
    connection.logout();
    toast(t('admin.unlock.closed'), 'info');
    close();
  }
</script>

{#if ui.unlockOpen}
  <Dialog title={t('admin.unlock.title')} width={380} onclose={close}>
    <div class="unlock">
      {#if connection.admin}
        <p class="note">{t('admin.unlock.isOpen')}</p>
        <div class="actions">
          <Button variant="secondary" size="lg" icon="lock" onclick={lock}>{t('admin.unlock.lock')}</Button>
        </div>
      {:else if sim}
        <p class="note">{t('admin.unlock.sim')}</p>
        <div class="actions">
          <Button variant="primary" size="lg" icon="unlock" disabled={busy || !ready} onclick={openSim}>{t('admin.unlock.open')}</Button>
        </div>
      {:else}
        <form onsubmit={submit} novalidate>
          <p class="note">{ready ? t('admin.unlock.live', { host }) : t('admin.unlock.waiting', { host })}</p>
          <label class="label" for="admin-pin">{t('admin.unlock.pin')}</label>
          <input
            id="admin-pin"
            class="pin"
            class:bad={wrong}
            bind:this={input}
            bind:value={pin}
            type="password"
            inputmode="numeric"
            autocomplete="off"
            enterkeyhint="go"
            maxlength="32"
            spellcheck="false"
            disabled={locked || !ready}
            aria-invalid={wrong}
            aria-describedby="admin-pin-message"
            oninput={() => (wrong = false)} />
          <p id="admin-pin-message" class="message" class:error={wrong || failure} class:warn={locked} aria-live="polite">
            {#if locked}
              <Icon name="clock" size={13} />
              <span>{t('admin.unlock.locked', { wait: waitText(left) })}</span>
            {:else if wrong}
              <Icon name="warning" size={13} />
              <span>{tries === null ? t('admin.unlock.wrong') : tries === 1 ? t('admin.unlock.wrongOne') : t('admin.unlock.wrongLeft', { n: tries })}</span>
            {:else if failure}
              <Icon name="warning" size={13} />
              <span>{failure}</span>
            {:else if freed}
              <span>{t('admin.unlock.free')}</span>
            {/if}
          </p>
          <div class="actions">
            <Button variant="primary" size="lg" type="submit" icon="unlock" disabled={busy || locked || !ready || pin.length === 0}>
              {busy ? t('admin.unlock.checking') : t('admin.unlock.submit')}
            </Button>
          </div>
        </form>
      {/if}
      {#if failure && (sim || connection.admin)}
        <p class="message error" aria-live="polite"><Icon name="warning" size={13} /><span>{failure}</span></p>
      {/if}
    </div>
  </Dialog>
{/if}

<style>
  .note {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text-secondary);
  }

  .label {
    display: block;
    margin-top: 16px;
    margin-bottom: 6px;
    font-size: 11.5px;
    color: var(--text-secondary);
  }

  /* big enough for a thumb and for reading from a step away */
  .pin {
    display: block;
    width: 100%;
    height: 44px;
    padding: 0 12px;
    font-size: 20px;
    letter-spacing: 0.35em;
    color: var(--text-strong);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    outline: none;
    transition: border-color 0.1s ease;
  }

  .pin:focus {
    border-color: var(--accent-ink);
  }

  .pin.bad {
    border-color: var(--error);
  }

  .pin:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .message {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 18px;
    margin-top: 8px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-secondary);
  }

  .message.error {
    color: var(--error);
  }

  .message.warn {
    color: var(--warning);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  /* a phone gets full width buttons in the thumb zone */
  @media (max-width: 480px), (pointer: coarse) {
    .actions :global(.btn) {
      flex: 1;
    }
  }
</style>
