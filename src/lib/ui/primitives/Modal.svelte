<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    open?: boolean
    title: string

    label?: string

    width?: string
    onclose: () => void

    sub?: Snippet
    children: Snippet

    footer?: Snippet
  }

  let {
    open = false,
    title,
    label,
    width = '30rem',
    onclose,
    sub,
    children,
    footer,
  }: Props = $props()

  let dialog = $state<HTMLDivElement>()

  let restoreTo: HTMLElement | null = null

  $effect(() => {
    if (!open) return

    restoreTo = document.activeElement as HTMLElement | null
    dialog?.focus()

    return () => {
      if (restoreTo?.isConnected) restoreTo.focus()
      restoreTo = null
    }
  })

  function focusable(): HTMLElement[] {
    if (!dialog) return []
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    return [...dialog.querySelectorAll<HTMLElement>(selector)].filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    )
  }

  function trap(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return

    const items = focusable()
    if (items.length === 0) {
      event.preventDefault()
      dialog?.focus()
      return
    }

    const first = items[0]
    const last = items[items.length - 1]
    const current = document.activeElement

    if (event.shiftKey && (current === first || current === dialog)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && current === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function swallow(event: Event): void {
    event.stopPropagation()
  }
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={onclose}>
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title}
      tabindex="-1"
      bind:this={dialog}
      style:width="min({width}, 92vw)"
      onclick={swallow}
      onkeydown={trap}
    >
      <header>
        <h2>{title}</h2>
        {#if sub}<span class="sub">{@render sub()}</span>{/if}
      </header>

      <div class="body">{@render children()}</div>

      {#if footer}<div class="actions">{@render footer()}</div>{/if}
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: var(--scrim);
    pointer-events: auto;
    z-index: var(--z-modal);
  }

  .modal {
    max-height: 86vh;
    display: flex;
    flex-direction: column;
    padding: 1.2rem 1.4rem 1.3rem;
    background: var(--bg);
    border: 1px solid var(--corona-dim);
    border-radius: 0.4rem;
    font-size: 0.8rem;
  }

  .modal:focus {
    outline: none;
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--corona-dim);
  }

  h2 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--corona);
  }

  .sub {
    font-size: 0.72rem;
    color: var(--muted);
  }

  .body {
    overflow-y: auto;
    padding-top: 0.9rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.1rem;
  }
</style>
