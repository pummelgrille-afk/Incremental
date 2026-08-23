<script lang="ts">
  import { game } from '../stores/game.svelte'
  import { content, t } from '../stores/i18n.svelte'
  import Button from './primitives/Button.svelte'
  import Kbd from './primitives/Kbd.svelte'

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

{#if card}
  <aside class="card" aria-live="polite">
    <header>
      <span class="label">{t('term.manual')}</span>
      {#if card.key}<span class="key"><Kbd>{card.key}</Kbd></span>{/if}
    </header>

    <h3>{content('tutorial', card.id, 'name', card.name)}</h3>
    <p>{content('tutorial', card.id, 'description', card.description)}</p>

    <footer>
      {#if game.tutorialQueue.length > 1}
        <span class="more">{t('tutorial.more', { count: game.tutorialQueue.length - 1 })}</span>
      {/if}
      <span class="act"><Button small onclick={dismiss}>{t('common.dismiss')}</Button></span>
    </footer>
  </aside>
{/if}

<style>
  .card {
    position: fixed;
    left: 1.25rem;
    bottom: 1.25rem;
    z-index: var(--z-notice);
    width: min(22rem, calc(100vw - 2.5rem));
    padding: 0.9rem 1rem 0.8rem;
    background: rgba(11, 10, 8, 0.96);
    border: 1px solid var(--corona-dim);
    border-left: 2px solid var(--corona);
    border-radius: var(--radius);
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

  .key {
    margin-left: auto;
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

  .act {
    margin-left: auto;
  }
</style>
