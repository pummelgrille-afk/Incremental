<script lang="ts">
  import { onMount } from 'svelte'
  import { startGame, type GameSession } from './lib/core/bootstrap'
  import { game } from './lib/stores/game.svelte'
  import { t } from './lib/stores/i18n.svelte'
  import HUD from './lib/ui/HUD.svelte'
  import FormationEditor from './lib/ui/FormationEditor.svelte'
  import UpgradeTree from './lib/ui/UpgradeTree.svelte'
  import StageSelect from './lib/ui/StageSelect.svelte'
  import PrestigeModal from './lib/ui/PrestigeModal.svelte'
  import WelcomeBack from './lib/ui/WelcomeBack.svelte'
  import AchievementToast from './lib/ui/AchievementToast.svelte'
  import Tutorial from './lib/ui/Tutorial.svelte'
  import Sidebar from './lib/ui/Sidebar.svelte'
  import MainMenu from './lib/ui/MainMenu.svelte'
  import SettingsMenu from './lib/ui/SettingsMenu.svelte'

  /**
   * The shell: the field, and everything drawn over it.
   *
   * Deliberately thin. It starts the session, holds the canvas, and mounts each
   * screen against the flag in the store that opens it — nothing here decides
   * anything. The order is the stacking order, which `--z-*` in app.css names
   * and none of these files repeat.
   */

  let host = $state<HTMLDivElement>()
  let session: GameSession | undefined
  let error = $state<string | null>(null)

  /**
   * The two settings that apply to the document rather than to the field.
   *
   * They belong here and not in `bootstrap.ts` for the same reason `render.ts`
   * owns the palette: this is the layer that owns the DOM. Text scale is a
   * root font size, so every `rem` in every panel follows it without a single
   * component knowing the setting exists — which is the whole reason the
   * primitives were written in `rem` in Phase 42.
   *
   * Reduced motion is an attribute rather than a class so `app.css` can switch
   * off every chrome animation in one rule, including ones added later that
   * nobody remembers to check a flag in.
   */
  $effect(() => {
    document.documentElement.style.setProperty('--text-scale', String(game.settings.textScale))
  })

  $effect(() => {
    document.documentElement.toggleAttribute('data-reduced-motion', game.settings.reducedMotion)
  })

  /*
   * Whether the operating system has already asked for reduced motion.
   *
   * Watched rather than read once: it can change while the page is open, and a
   * player switching it on in system settings to see whether the game respects
   * it would otherwise find that it does not until a reload.
   */
  $effect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => (game.systemReducedMotion = query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  })

  onMount(() => {
    let disposed = false

    startGame(host!)
      .then((s) => {
        if (disposed) {
          s.destroy()
          return
        }
        session = s
      })
      .catch((e: unknown) => {
        error = e instanceof Error ? e.message : String(e)
        console.error('[perihelion] failed to start', e)
      })

    return () => {
      disposed = true
      session?.destroy()
    }
  })
</script>

<div class="stage" bind:this={host}></div>

{#if error}
  <div class="error">
    <strong>{t('app.failed')}</strong>
    <code>{error}</code>
  </div>
{:else}
  <HUD showDiagnostics={game.showDiagnostics} />
  <Sidebar />
  <FormationEditor open={game.showFormation} />
  <UpgradeTree open={game.showTree} />
  <StageSelect open={game.showMap} />
  <PrestigeModal open={game.showPrestige} />
  <MainMenu open={game.showMenu} />
  <SettingsMenu open={game.showSettings} />
  <WelcomeBack />
  <AchievementToast />
  <Tutorial />
{/if}

<style>
  .stage {
    position: fixed;
    inset: 0;
  }

  .error {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.5rem 2rem;
    text-align: center;
    background: rgba(11, 10, 8, 0.95);
    border: 1px solid var(--danger);
    border-radius: 0.4rem;
  }

  strong {
    color: var(--danger);
  }

  code {
    color: var(--muted);
    font-size: 0.8rem;
  }
</style>
