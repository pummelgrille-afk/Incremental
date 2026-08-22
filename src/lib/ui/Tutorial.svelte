<script lang="ts">
  import { game } from '../stores/game.svelte'

  /**
   * The onboarding card.
   *
   * PLAN.md Phase 36 asks for "contextual tooltips/first-time popups rather
   * than a forced tutorial", so this is deliberately **not** a modal. It does
   * not dim the field, it does not take focus, it does not stop the wave, and
   * it does not have a next button. It appears in the corner when a system
   * becomes relevant, and it goes away when the player is done with it.
   *
   * Which is also why it sits above the field but leaves it clickable: the
   * Flare is the player's only live input, and a card that blocked it while
   * explaining it would be its own worst example.
   *
   * Nothing here decides *when* to appear. `progression/tutorial.ts` owns that,
   * because a rule living in a template is a rule nothing can test.
   */

  const card = $derived(game.tutorialQueue[0] ?? null)

  function dismiss() {
    // The step was marked seen when it was raised, not here — dismissing is
    // only ever about this card leaving the screen. A player who reloads
    // mid-card does not get it again, which is the right side to err on: an
    // explanation repeating itself reads worse than one missed.
    game.tutorialQueue = game.tutorialQueue.slice(1)
  }
</script>

<svelte:window onkeydown={(e) => card && e.key === 'Escape' && dismiss()} />

{#if card}
  <aside class="card" aria-live="polite">
    <header>
      <span class="label">The Manual</span>
      {#if card.key}<kbd>{card.key}</kbd>{/if}
    </header>

    <h3>{card.name}</h3>
    <p>{card.description}</p>

    <footer>
      {#if game.tutorialQueue.length > 1}
        <span class="more">{game.tutorialQueue.length - 1} more</span>
      {/if}
      <button onclick={dismiss}>Understood</button>
    </footer>
  </aside>
{/if}

<style>
  .card {
    position: fixed;
    left: 1.25rem;
    bottom: 1.25rem;
    z-index: 15;
    width: min(22rem, calc(100vw - 2.5rem));
    padding: 0.9rem 1rem 0.8rem;
    background: rgba(11, 10, 8, 0.96);
    border: 1px solid var(--corona-dim);
    border-left: 2px solid var(--corona);
    border-radius: 0.3rem;
    box-shadow: 0 0.6rem 1.6rem rgba(0, 0, 0, 0.55);
    font-size: 0.78rem;
    /* Above the field, but the field stays clickable around it. */
    pointer-events: auto;
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .label {
    font-size: 0.6rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }

  kbd {
    margin-left: auto;
    display: inline-block;
    min-width: 1.3rem;
    padding: 0.05rem 0.35rem;
    text-align: center;
    color: var(--corona);
    border: 1px solid var(--corona-dim);
    border-radius: 0.2rem;
    font-size: 0.7rem;
  }

  h3 {
    margin: 0.25rem 0 0.4rem;
    font-size: 0.95rem;
    color: var(--text);
  }

  p {
    margin: 0;
    color: var(--muted);
    line-height: 1.55;
  }

  footer {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.8rem;
  }

  .more {
    font-size: 0.68rem;
    color: var(--muted);
  }

  button {
    margin-left: auto;
    padding: 0.3rem 0.8rem;
    font: inherit;
    font-size: 0.72rem;
    color: var(--bg);
    background: var(--corona);
    border: none;
    border-radius: 0.2rem;
    cursor: pointer;
  }
</style>
