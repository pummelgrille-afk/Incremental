<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  interface Props extends HTMLButtonAttributes {
    variant?: 'primary' | 'ghost' | 'danger'

    block?: boolean

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
