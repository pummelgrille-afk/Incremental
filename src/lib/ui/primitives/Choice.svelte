<script lang="ts">

  interface Option<T extends string> {
    value: T
    label: string
  }

  interface Props<T extends string> {
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
