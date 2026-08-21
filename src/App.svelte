<script lang="ts">
  import { onMount } from 'svelte'
  import { startGame, type GameSession } from './lib/core/bootstrap'
  import { game } from './lib/stores/game.svelte'
  import HUD from './lib/ui/HUD.svelte'
  import FormationEditor from './lib/ui/FormationEditor.svelte'
  import UpgradeTree from './lib/ui/UpgradeTree.svelte'
  import PrestigeModal from './lib/ui/PrestigeModal.svelte'

  /**
   * Phase 10 vertical slice. The default view, so `npm run dev` shows the game
   * immediately (PLAN.md Phase 10). Phase 42 builds the real shell around this.
   */

  let host = $state<HTMLDivElement>()
  let session: GameSession | undefined
  let error = $state<string | null>(null)

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
        console.error('[orrery] failed to start', e)
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
    <strong>The Orrery did not start.</strong>
    <code>{error}</code>
  </div>
{:else}
  <HUD showDiagnostics={game.showDiagnostics} />
  <FormationEditor open={game.showFormation} />
  <UpgradeTree open={game.showTree} />
  <PrestigeModal open={game.showPrestige} />
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
    border: 1px solid #f87171;
    border-radius: 0.4rem;
  }

  strong {
    color: #f87171;
  }

  code {
    color: var(--muted);
    font-size: 0.8rem;
  }
</style>
