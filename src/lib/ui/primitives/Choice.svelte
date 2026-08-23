<script lang="ts">
  /**
   * One of a handful of named options, all visible at once.
   *
   * A radio group, not a `<select>`. The options this game needs to offer —
   * three colourblind palettes, three text sizes — are things a player is
   * *comparing*, and a dropdown hides every option but the chosen one at
   * exactly the moment they want to see the set. Under four options a segmented
   * control is strictly more informative and costs the same space.
   *
   * Real `<input type="radio">` underneath, so arrow keys move between options
   * and the group announces itself as a group. That behaviour is not worth
   * reimplementing and is usually reimplemented badly.
   */

  interface Option<T extends string> {
    value: T
    label: string
  }

  interface Props<T extends string> {
    /** Shared across the group's radios; also the label's target. */
    id: string
    value: T
    options: readonly Option<T>[]
    onchange: (value: T) => void
    label?: string
  }

  let { id, value, options, onchange, label }: Props<string> = $props()
</script>

<span class="choice" role="radiogroup" aria-label={label}>
  {#each options as option, i (option.value)}
    <label class="option" class:selected={option.value === value}>
      <input
        id={i === 0 ? id : undefined}
        type="radio"
        name={id}
        value={option.value}
        checked={option.value === value}
        onchange={() => onchange(option.value)}
      />
      <span>{option.label}</span>
    </label>
  {/each}
</span>

<style>
  /*
   * Wraps. Four options of nowrap text in a fixed-width dialog fit English and
   * nothing else — the palette row is already 39 characters wide, and Phase
   * 44's pseudolocale pushed it straight through the side of the Modal. The
   * segmented look survives wrapping; an overflowing row does not.
   */
  .choice {
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: 100%;
    border: 1px solid var(--corona-dim);
    border-radius: 0.25rem;
    overflow: hidden;
  }

  .option {
    position: relative;
    display: block;
    cursor: pointer;
  }

  .option + .option {
    border-left: 1px solid var(--corona-dim);
  }

  input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  span {
    display: block;
    padding: 0.28rem 0.6rem;
    font-size: 0.72rem;
    color: var(--muted);
    white-space: nowrap;
  }

  .selected span {
    color: var(--bg);
    background: var(--corona);
  }

  .option:hover:not(.selected) span {
    color: var(--text);
  }

  input:focus-visible + span {
    outline: 2px solid var(--corona);
    outline-offset: -2px;
  }
</style>
