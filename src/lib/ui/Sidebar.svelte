<script lang="ts">
  import { game } from '../stores/game.svelte'
  import { bindingLabel } from '../core/keybindings'
  import type { ActionId } from '../content/keybindings'
  import { t } from '../stores/i18n.svelte'
  import Kbd from './primitives/Kbd.svelte'

  interface Entry {
    label: string

    id: string
    action: ActionId | null
    open: () => void

    shown: boolean

    active: boolean
  }

  const key = (action: ActionId | null) =>
    action === null ? '' : bindingLabel(game.keybindings[action] ?? '')

  const entries = $derived<Entry[]>([
    {
      id: 'formation',
      label: t('sidebar.formation'),
      action: 'formation',
      open: () => (game.showFormation = !game.showFormation),
      shown: true,
      active: game.showFormation,
    },
    {
      id: 'map',
      label: t('sidebar.map'),
      action: 'map',
      open: () => (game.showMap = !game.showMap),
      shown: true,
      active: game.showMap,
    },
    {
      id: 'tree',
      label: t('sidebar.tree'),
      action: 'tree',
      open: () => (game.showTree = !game.showTree),
      shown: game.treeRevealed,
      active: game.showTree,
    },
    {
      id: 'rewind',
      label: t('sidebar.rewind'),
      action: 'rewind',
      open: () => (game.showPrestige = !game.showPrestige),
      shown: game.rewindUnlocked,
      active: game.showPrestige,
    },
    {
      id: 'manual',
      label: t('sidebar.manual'),
      action: 'manual',
      open: () => (game.manualRequested = true),
      shown: true,
      active: false,
    },
    {
      id: 'menu',
      label: t('sidebar.menu'),
      action: 'menu',
      open: () => (game.showMenu = !game.showMenu),
      shown: true,
      active: game.showMenu,
    },
  ])

  const visible = $derived(entries.filter((e) => e.shown))
</script>

{#if !game.showFormation && !game.showTree && !game.showMap && !game.showPrestige && !game.showMenu && !game.showSettings}
  <nav aria-label={t('sidebar.label')}>
    <ul>
      {#each visible as entry (entry.id)}
        <li>
          <button class="tab" class:active={entry.active} onclick={entry.open}>
            <span class="label">{entry.label}</span>
            {#if entry.action}<Kbd>{key(entry.action)}</Kbd>{/if}
          </button>
        </li>
      {/each}

      <li class="apart">

        <button
          class="tab"
          class:active={game.standby}
          disabled={game.standby}
          title={game.standby ? t('sidebar.held.hint') : t('sidebar.stand-down.hint')}
          onclick={() => game.stageActions?.standDown()}
        >
          <span class="label">{game.standby ? t('sidebar.held') : t('sidebar.stand-down')}</span>
        </button>
      </li>
    </ul>
  </nav>
{/if}

<style>
  nav {
    position: fixed;
    top: 50%;
    right: 0;
    transform: translateY(-50%);
    z-index: var(--z-hud);

    pointer-events: auto;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .apart {
    margin-top: 0.6rem;
  }

  .tab {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    width: 100%;
    padding: 0.45rem 0.7rem;
    font: inherit;
    font-size: 0.72rem;
    color: var(--muted);
    text-align: right;
    background: rgba(11, 10, 8, 0.82);
    border: 1px solid var(--corona-dim);
    border-right: none;
    border-radius: 0.25rem 0 0 0.25rem;
    cursor: pointer;
    transition: color 120ms linear, border-color 120ms linear;
  }

  .tab:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--corona);
  }

  .tab:disabled {
    color: var(--inert);
    cursor: default;
  }

  .tab:focus-visible {
    outline: 2px solid var(--corona);
    outline-offset: -2px;
  }

  .tab.active {
    color: var(--corona);
    border-color: var(--corona);
  }

  .label {
    white-space: nowrap;
  }
</style>
