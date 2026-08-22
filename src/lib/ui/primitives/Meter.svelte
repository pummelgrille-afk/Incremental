<script lang="ts">
  /**
   * A bar reporting a fraction.
   *
   * Two of these are on screen at all times — Output and the Flare's charge —
   * and they had drifted apart in the one way that matters: the Output bar
   * eased its width over 120 ms, the Flare bar could not, and the second had to
   * cancel the first's transition by hand in its own stylesheet.
   *
   * So easing is a **prop**, and the rule behind it is written down once: ease
   * a bar that moves in steps, never one that moves every frame. A 120 ms ease
   * on a value updated at 60 Hz reports a state the player has already left.
   */

  interface Props {
    /** 0…1. Values outside that range are clamped rather than overflowing. */
    fraction: number
    tone?: 'corona' | 'danger' | 'dim'
    /** Follows the value exactly, for anything that updates every frame. */
    instant?: boolean
    /** A one-shot flash when the value drops. Combat readability, not decoration. */
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

  /*
   * The bar itself flares, rather than a separate flash element being layered
   * over it. One element means the effect cannot end up misaligned with the
   * thing it is reporting on, which is what a second absolutely-positioned
   * layer would eventually do.
   */
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
