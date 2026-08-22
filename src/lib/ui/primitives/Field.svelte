<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * One labelled setting: a name, an optional line saying what it does, and a
   * control.
   *
   * Its own file because a settings row is the one place in this game where the
   * *explanation* is as important as the control. "Reduced motion" tells a
   * player nothing about which motion; the line under it does, and a row that
   * makes that line optional-looking is a row nobody will write it into.
   *
   * The label is a real `<label>` wrapping nothing — it is associated by `for`,
   * so it works for a control the caller supplies, whatever that turns out to
   * be. Callers pass the same id to both.
   */

  interface Props {
    label: string
    /** The id of the control this labels. */
    for: string
    /** What it does, in one line. Worth writing for anything non-obvious. */
    hint?: string
    /** Shown after the control: a current value, a conflict, a warning. */
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
