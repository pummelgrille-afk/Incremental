<script lang="ts">
  import { compact } from '../../utils/format'

  interface Props {
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
