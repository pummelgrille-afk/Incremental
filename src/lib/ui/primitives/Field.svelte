<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    label: string

    for: string

    hint?: string

    note?: Snippet
    children: Snippet
  }

  let { label, for: htmlFor, hint, note, children }: Props = $props()
</script>

<div class="field">
  <div class="text">
    <label for={htmlFor}>{label}</label>
    {#if hint}<p class="hint">{hint}</p>{/if}
  </div>

  <div class="control">
    {@render children()}
    {#if note}<div class="note">{@render note()}</div>{/if}
  </div>
</div>

<style>
  .field {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: start;
    gap: 1rem;
    padding: 0.55rem 0;
    border-bottom: 1px solid rgba(122, 100, 24, 0.18);
  }

  label {
    color: var(--text);
  }

  .hint {
    margin: 0.15rem 0 0;
    font-size: 0.72rem;
    line-height: 1.45;
    color: var(--muted);
  }

  .control {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.3rem;
  }

  .note {
    font-size: 0.7rem;
    color: var(--muted);
    text-align: right;
  }
</style>
