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

  let host = $state<HTMLDivElement>()
  let session: GameSession | undefined
  let error = $state<string | null>(null)

  $effect(() => {
    document.documentElement.style.setProperty('--text-scale', String(game.settings.textScale))
  })

  $effect(() => {
    document.documentElement.toggleAttribute('data-reduced-motion', game.settings.reducedMotion)
  })

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
