<script lang="ts">
  import { game } from '../stores/game.svelte'
  import { content, t } from '../stores/i18n.svelte'

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
    if (game.achievementQueue.length > 0 && current === null) next()
  })

  $effect(() => () => clearTimeout(timer))
</script>

{#if current}

  <div class="live" role="status" aria-live="polite">
    <button class="toast" onclick={next}>
      <span class="label">{t('toast.label')}</span>
      <strong>{content('achievement', current.id, 'name', current.name)}</strong>
      <span class="what">
        {content('achievement', current.id, 'description', current.description)}
      </span>
    </button>
  </div>
{/if}

<style>
  .live {
    position: fixed;
    right: 1.25rem;
    bottom: 1.25rem;
    z-index: var(--z-notice);
  }

  .toast {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    max-width: 18rem;
    padding: 0.7rem 0.9rem;
    background: rgba(11, 10, 8, 0.96);
    border: 1px solid var(--corona);
    border-radius: var(--radius);
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
