<script lang="ts">
  import { game } from '../stores/game.svelte'
  import { bindingLabel } from '../core/keybindings'
  import type { ActionId } from '../content/keybindings'
  import { t } from '../stores/i18n.svelte'
  import Kbd from './primitives/Kbd.svelte'

  /**
   * The way in to every panel, without knowing a key.
   *
   * Until now the Formation editor, the map, the Almanac and the Rewind were
   * reachable **only** by keyboard shortcut. That is fine once you know them
   * and invisible until you do: the HUD's hint line was the entire discovery
   * path, and a hint line is something a player reads once and then stops
   * seeing. A row of buttons is the thing they can find by looking.
   *
   * The keys still work and are printed on the buttons, so this teaches them
   * rather than replacing them — which is why each row carries its keycap
   * instead of the hint line carrying all of them.
   *
   * **It opens panels and owns none of them.** Every entry sets the same store
   * flag the key handler sets, so the panels themselves did not change and
   * cannot tell which route was taken.
   */

  interface Entry {
    /** The store flag this toggles, or a direct action. */
    label: string
    /** Stable across languages; the label is not. */
    id: string
    action: ActionId | null
    open: () => void
    /** Hidden until the system it opens exists — economy-spec.md §3. */
    shown: boolean
    /** Lit while its panel is up. */
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

<!--
  Hidden while an overlay or a modal is up. Those cover it anyway by
  `--z-overlay` and `--z-modal`, but a button that is under a scrim and still
  tabbable is exactly the trap Phase 43's focus work exists to close.
-->
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
        <!-- Stand down: the between-state. Refused while there is nothing to
             stand down from, rather than hidden, so its existence is learnable
             before the moment it is wanted. -->
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
    /* The HUD around it is inert; this is the one part of it that is not. */
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

  /*
   * Not `<Button>`. The primitive's three variants are statements about what an
   * action *does* — primary, secondary, irreversible — and a navigation tab is
   * none of the three: it is a place, and it can be the place you are already
   * in. Same reasoning as StageSelect's stage tiles, ui-spec.md §3.
   */
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
