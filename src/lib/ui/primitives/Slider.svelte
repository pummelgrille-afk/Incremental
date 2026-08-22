<script lang="ts">
  /**
   * A continuous value, with its current reading beside it.
   *
   * The reading is not decoration. Three volume faders with no numbers on them
   * cannot be described to anyone, cannot be restored to where they were, and
   * cannot be talked about in a bug report — and these three in particular took
   * two phases to get right precisely because nobody could say what they were
   * set to.
   */

  interface Props {
    id: string
    value: number
    min?: number
    max?: number
    step?: number
    onchange: (value: number) => void
    /** How the current value is written. Defaults to a percentage. */
    format?: (value: number) => string
    label?: string
  }

  let {
    id,
    value,
    min = 0,
    max = 1,
    step = 0.05,
    onchange,
    format = (v: number) => `${Math.round(v * 100)}%`,
    label,
  }: Props = $props()
</script>

<span class="slider">
  <input
    {id}
    type="range"
    {min}
    {max}
    {step}
    {value}
    aria-label={label}
    aria-valuetext={format(value)}
    oninput={(e) => onchange(Number(e.currentTarget.value))}
  />
  <span class="reading">{format(value)}</span>
</span>

<style>
  .slider {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
  }

  .reading {
    min-width: 2.8rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }

  input {
    width: 9rem;
    height: 1rem;
    margin: 0;
    background: transparent;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
  }

  input::-webkit-slider-runnable-track {
    height: 4px;
    background: var(--well);
    border: 1px solid var(--corona-dim);
    border-radius: 2px;
  }

  input::-moz-range-track {
    height: 4px;
    background: var(--well);
    border: 1px solid var(--corona-dim);
    border-radius: 2px;
  }

  input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 0.85rem;
    height: 0.85rem;
    margin-top: -0.34rem;
    background: var(--corona);
    border: none;
    border-radius: 50%;
  }

  input::-moz-range-thumb {
    width: 0.85rem;
    height: 0.85rem;
    background: var(--corona);
    border: none;
    border-radius: 50%;
  }

  input:focus-visible {
    outline: 2px solid var(--corona);
    outline-offset: 3px;
  }
</style>
