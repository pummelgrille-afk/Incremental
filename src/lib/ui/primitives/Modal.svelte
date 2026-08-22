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
   * **Focus moves to the dialog when it opens.** None of the three did that:
   * Escape worked only because the handler was on the window, and a tab press
   * walked the HUD behind the scrim. Phase 43 needs the whole UI reachable from
   * the keyboard, and this is the half of it that belongs here.
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

  $effect(() => {
    if (open) dialog?.focus()
  })

  /** Stops a click inside the panel from reaching the scrim's dismiss. */
  function swallow(event: Event): void {
    event.stopPropagation()
  }
</script>

<!-- Outside the `{#if}`: `<svelte:window>` cannot be nested in an element. -->
<svelte:window
  onkeydown={(e) => {
    if (open && e.key === 'Escape') onclose()
  }}
/>

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
      onkeydown={swallow}
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
