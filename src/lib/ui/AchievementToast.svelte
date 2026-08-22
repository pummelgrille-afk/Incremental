<script lang="ts">
  import { game } from '../stores/game.svelte'

  /**
   * Announces newly earned achievements.
   *
   * Drains the store's queue one at a time rather than showing them stacked.
   * Several can land on the same tick — a first clear that was also untouched —
   * and three cards appearing together reads as one event rather than three.
   *
   * Deliberately a corner toast, not a modal. An achievement is a remark, not
   * an interruption, and stopping the field to acknowledge one would be the
   * opposite of P1.
   */

  const SHOW_SECONDS = 4.5

  let current = $state<{ id: string; name: string; description: string } | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  function next() {
    clearTimeout(timer)
    if (game.achievementQueue.length === 0) {
      current = null
      return
    }

    const [head, ...rest] = game.achievementQueue
    game.achievementQueue = rest
    current = head
    timer = setTimeout(next, SHOW_SECONDS * 1000)
  }

  $effect(() => {
    // Only pulls when idle; the timer drives the rest of the queue.
    if (game.achievementQueue.length > 0 && current === null) next()
  })

  $effect(() => () => clearTimeout(timer))
</script>

{#if current}
  <!-- A button, not a div: clicking it dismisses, so it is genuinely
       interactive and gets keyboard and focus handling for free. `role=status`
       on the wrapper is what announces it to a screen reader. -->
  <div class="live" role="status" aria-live="polite">
    <button class="toast" onclick={next}>
      <span class="label">Noted</span>
      <strong>{current.name}</strong>
      <span class="what">{current.description}</span>
    </button>
  </div>
{/if}

<style>
  .live {
    position: fixed;
    right: 1.25rem;
    bottom: 1.25rem;
    z-index: 15;
  }

  .toast {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    max-width: 18rem;
    padding: 0.7rem 0.9rem;
    background: rgba(11, 10, 8, 0.96);
    border: 1px solid var(--corona);
    border-radius: 0.3rem;
    font-size: 0.78rem;
    font-family: inherit;
    text-align: left;
    pointer-events: auto;
    cursor: pointer;
    animation: slide-in 220ms ease-out;
  }

  @keyframes slide-in {
    from {
      opacity: 0;
      transform: translateY(0.5rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .label {
    font-size: 0.58rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--corona);
  }

  strong {
    color: var(--text);
    font-weight: 500;
  }

  .what {
    color: var(--muted);
    font-size: 0.72rem;
    line-height: 1.4;
  }
</style>
