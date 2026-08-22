<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  /**
   * Every button in the game.
   *
   * Three variants, and the reason there are only three is that each one
   * answers a different question: **primary** is what the panel is for,
   * **ghost** is a way out or a secondary tool, **danger** is a step that
   * cannot be taken back. A fourth would mean the set had stopped describing
   * intent and started describing colour.
   *
   * Before this file the rules lived in five separate style blocks and had
   * already drifted — two padding scales, two radii, and a disabled state
   * that was a flat grey in four of them and a lowered opacity in the fifth.
   */

  interface Props extends HTMLButtonAttributes {
    variant?: 'primary' | 'ghost' | 'danger'
    /** Fills its column. What a panel's single confirming action wants. */
    block?: boolean
    /** For toolbars, where a button sits inside a line of text. */
    small?: boolean
    children: Snippet
  }

  let {
    variant = 'primary',
    block = false,
    small = false,
    children,
    ...rest
  }: Props = $props()
</script>

<button class={variant} class:block class:small {...rest}>{@render children()}</button>

<style>
  button {
    padding: 0.45rem 0.9rem;
    font: inherit;
    font-size: 0.78rem;
    color: var(--bg);
    background: var(--corona);
    border: 1px solid transparent;
    border-radius: 0.25rem;
    cursor: pointer;
  }

  button:disabled {
    background: var(--inert);
    color: var(--muted);
    cursor: default;
  }

  /* Focus is drawn, not left to the platform ring: the ring is invisible
     against a dark panel on several browsers, and Phase 43 needs the whole UI
     reachable from the keyboard. */
  button:focus-visible {
    outline: 2px solid var(--corona);
    outline-offset: 2px;
  }

  .ghost {
    background: transparent;
    color: var(--muted);
    border-color: var(--corona-dim);
  }

  .ghost:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--corona);
  }

  .ghost:disabled {
    background: transparent;
    border-color: var(--inert);
  }

  .danger {
    background: var(--warn);
  }

  .block {
    display: block;
    width: 100%;
  }

  .small {
    padding: 0.28rem 0.6rem;
    font-size: 0.72rem;
  }
</style>
