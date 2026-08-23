<script lang="ts">
  import { game } from '../stores/game.svelte'
  import { content, t } from '../stores/i18n.svelte'
  import Button from './primitives/Button.svelte'
  import Kbd from './primitives/Kbd.svelte'

  const card = $derived(game.tutorialQueue[0] ?? null)

  function dismiss() {
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
