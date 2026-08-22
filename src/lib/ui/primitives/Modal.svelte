<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * A dialog over the running field.
   *
   * Three components were each carrying their own copy of this — scrim, centred
   * box, click-outside, an Escape handler on the window, and a
   * `stopPropagation` on both `click` and `keydown` so the outer handlers did
   * not fire through the panel. Three copies meant three scrim alphas (0.72,
   * 0.80, 0.82) chosen independently, and one of them had drifted to a
   * different border colour.
   *
   * The field keeps running behind a modal — the simulation is never paused by
   * chrome — which is why the scrim is translucent. A player deciding whether
   * to Rewind should be able to see what the decision is costing them.
   *
   * **Focus moves to the dialog when it opens, stays inside while it is open,
   * and goes back where it came from when it closes.** None of the three
   * hand-rolled dialogs did any of that: a tab press walked the HUD behind the
   * scrim. Phase 42 added the first of the three; Phase 43 added the other two,
   * which is the difference between a dialog a keyboard can open and one it can
   * use.
   *
   * **Escape is not handled here**, which is deliberate and was learned the
   * hard way. Every open Modal used to listen on the window, so one Escape with
   * two panels stacked closed *both* — and closing the last one raced the
   * global handler into reopening the menu it had just dismissed. Escape is a
   * binding like any other; `bootstrap.ts` routes it, because it is the only
   * place that knows the whole stacking order. See `docs/design/ui-spec.md` §7.
   */

  interface Props {
    open?: boolean
    title: string
    /** Announced name, when it should differ from the visible title. */
    label?: string
    /** Preferred width. Always yields to a narrow viewport. */
    width?: string
    onclose: () => void
    /** A line beside the title: a count, a state, a total. */
    sub?: Snippet
    children: Snippet
    /** The actions row, pinned under the content. */
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

  /**
   * Whatever had focus when this opened, so it can be handed back.
   *
   * Without it, closing a dialog drops focus onto `<body>` and the next Tab
   * starts from the top of the document — which, for a player who opened the
   * map from a keyboard, means losing their place every single time.
   */
  let restoreTo: HTMLElement | null = null

  $effect(() => {
    if (!open) return

    restoreTo = document.activeElement as HTMLElement | null
    dialog?.focus()

    return () => {
      // Guarded: the element may have been unmounted while the dialog was up,
      // and focusing a detached node silently sends focus to the body anyway.
      if (restoreTo?.isConnected) restoreTo.focus()
      restoreTo = null
    }
  })

  /** Everything inside the panel a keyboard can land on, in document order. */
  function focusable(): HTMLElement[] {
    if (!dialog) return []
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    return [...dialog.querySelectorAll<HTMLElement>(selector)].filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    )
  }

  /**
   * Keep Tab inside the panel.
   *
   * Computed on each press rather than cached on open: these panels change what
   * they contain while they are up — the Rewind grows a confirm button, the
   * settings screen swaps a keycap for "press a key" — and a list captured at
   * open time would send Tab to a control that no longer exists.
   */
  function trap(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return

    const items = focusable()
    if (items.length === 0) {
      // Nothing to move to. Holding focus on the panel beats letting Tab
      // escape to the HUD behind the scrim.
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

  /** Stops a click inside the panel from reaching the scrim's dismiss. */
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
    /* The dialog takes focus so the keyboard has somewhere to land; drawing a
       ring around the whole panel for it would be noise. Focus inside the
       panel is still drawn, by whatever holds it. */
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
    /* The panel scrolls, not the page: a long stage list must not push the
       actions row off the bottom of the viewport. */
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
