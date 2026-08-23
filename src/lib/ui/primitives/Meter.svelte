<script lang="ts">

  interface Props {
    fraction: number
    tone?: 'corona' | 'danger' | 'dim'

    instant?: boolean

    struck?: boolean
    label?: string
  }

  let {
    fraction,
    tone = 'corona',
    instant = false,
    struck = false,
    label,
  }: Props = $props()

  const clamped = $derived(Math.max(0, Math.min(1, fraction)))
</script>

<div
  class="meter"
  class:struck
  role="progressbar"
  aria-label={label}
  aria-valuenow={Math.round(clamped * 100)}
  aria-valuemin="0"
  aria-valuemax="100"
>
  <div class="fill {tone}" class:instant style:width="{clamped * 100}%"></div>
</div>

<style>
  .meter {
    width: 100%;
    height: 6px;
    background: var(--well);
    border: 1px solid var(--corona-dim);
    border-radius: 3px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--corona);
    transition: width 120ms linear;
  }

  .instant {
    transition: none;
  }

  .danger {
    background: var(--danger);
  }

  .dim {
    background: var(--corona-dim);
  }

  .struck {
    border-color: var(--danger);
    animation: struck 320ms ease-out;
  }

  @keyframes struck {
    from {
      box-shadow: inset 0 0 0 2px var(--danger);
    }
    to {
      box-shadow: inset 0 0 0 2px transparent;
    }
  }
</style>
