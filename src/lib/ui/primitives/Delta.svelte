<script lang="ts">
  import { compact } from '../../utils/format'

  /**
   * A pooled gain or loss, floating off the number it belongs to.
   *
   * The figure is decided in `utils/delta.ts` and only drawn here. What this
   * file owns is the two things a float has to get right: it leaves in the
   * direction of the change — up for a gain, down for a loss, which is legible
   * at a glance and in peripheral vision — and it never sits still long enough
   * to be read twice.
   *
   * Renders nothing at zero rather than fading an empty span, so a HUD with
   * nothing happening in it costs no elements.
   */

  interface Props {
    /** Always positive; `direction` carries the sign. */
    value: number
    direction: 'gain' | 'loss'
  }

  let { value, direction }: Props = $props()
</script>

{#if value > 0}
  <span class="delta {direction}" aria-hidden="true">
    {direction === 'gain' ? '+' : '−'}{compact(value)}
  </span>
{/if}

<style>
  .delta {
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
    animation: rise 1.1s linear forwards;
  }

  .gain {
    color: var(--corona);
  }

  .loss {
    color: var(--danger);
    animation-name: fall;
  }

  @keyframes rise {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(-0.4rem);
    }
  }

  @keyframes fall {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(0.4rem);
    }
  }
</style>
