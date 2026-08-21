<script lang="ts">
  import { game, type TreeNodeView } from '../stores/game.svelte'

  /**
   * The Escapement Tree.
   *
   * Node positions are derived in `progression/upgradeTree.ts`, not authored —
   * radial, because the game is an orrery, and because the layout has to stay
   * legible when Phase 34 grows it from twelve nodes to seventy-two.
   *
   * Drawn as SVG rather than Pixi: this is a menu, not the field. It wants
   * crisp text and hit-testing at any zoom, and it must never compete with the
   * simulation for the render budget.
   */

  let { open = false }: { open?: boolean } = $props()

  const BRANCH_LABELS = {
    winding: 'Winding',
    bracing: 'Bracing',
    salvage: 'Salvage',
    regulation: 'Regulation',
  } as const

  const EFFECT_LABELS: Record<string, string> = {
    attack: 'attack',
    haste: 'attack speed',
    conjunctionPotency: 'conjunction potency',
    tension: 'Tension',
    defence: 'defence',
    blockArc: 'block arc',
    filings: 'Filings',
    recollection: 'Recollection',
    repairCost: 'repair cost',
    beatCharges: 'Beat charges',
    beatRadius: 'blast radius',
    conjunctionTolerance: 'conjunction window',
  }

  /** Flat counts read as counts; everything else reads as a percentage. */
  const FLAT = new Set(['tension', 'beatCharges', 'beatRadius'])
  const ANGLE = new Set(['blockArc', 'conjunctionTolerance'])

  function effectText(kind: string, magnitude: number): string {
    const label = EFFECT_LABELS[kind] ?? kind
    if (ANGLE.has(kind)) return `+${Math.round((magnitude * 180) / Math.PI)}° ${label}`
    if (FLAT.has(kind)) return `+${magnitude} ${label}`
    // A repair-cost node reduces; every other proportional node adds.
    const sign = kind === 'repairCost' ? '−' : '+'
    return `${sign}${Math.round(magnitude * 100)}% ${label}`
  }

  // --- Pan and zoom. -------------------------------------------------------

  let scale = $state(0.85)
  let panX = $state(0)
  let panY = $state(0)

  /*
   * The layout is centred on the origin, and SVG puts the origin in the
   * top-left corner — so without this the tree hangs off the top and left of
   * the viewport. Measured rather than assumed, because the panel is a grid
   * column whose width depends on the window.
   */
  let viewWidth = $state(0)
  let viewHeight = $state(0)
  const originX = $derived(viewWidth / 2 + panX)
  const originY = $derived(viewHeight / 2 + panY)
  // Reactive because the template reads it for the grab cursor; the drag
  // origins below are not, since nothing renders them.
  let dragging = $state(false)
  let dragFromX = 0
  let dragFromY = 0

  function onWheel(event: WheelEvent) {
    event.preventDefault()
    // Multiplicative, so a notch feels the same at every zoom level.
    const next = scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12)
    scale = Math.min(2.2, Math.max(0.35, next))
  }

  function onPointerDown(event: PointerEvent) {
    dragging = true
    dragFromX = event.clientX - panX
    dragFromY = event.clientY - panY
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging) return
    panX = event.clientX - dragFromX
    panY = event.clientY - dragFromY
  }

  function onPointerUp(event: PointerEvent) {
    dragging = false
    ;(event.currentTarget as Element).releasePointerCapture(event.pointerId)
  }

  function reset() {
    scale = 0.85
    panX = 0
    panY = 0
  }

  // --- Selection and the path preview. -------------------------------------

  let selectedId = $state<string | null>(null)

  const selected = $derived(game.tree.find((n) => n.id === selectedId) ?? null)

  /**
   * The chain of nodes reaching the selection, and what it costs together.
   *
   * Quoted from the backend rather than summed here: each purchase raises its
   * branch's depth, so adding up today's prices would under-quote every
   * multi-step path — the one thing a planning affordance must not do.
   */
  const path = $derived(
    selectedId && game.treeActions ? game.treeActions.preview(selectedId) : null,
  )

  const pathIds = $derived(new Set(path?.ids ?? []))

  const byId = $derived(new Map(game.tree.map((n) => [n.id, n])))

  /** Every prerequisite edge, for drawing. */
  const edges = $derived(
    game.tree.flatMap((node) =>
      node.requires
        .map((id) => byId.get(id))
        .filter((from): from is TreeNodeView => from !== undefined)
        .map((from) => ({ from, to: node })),
    ),
  )

  function stateOf(node: TreeNodeView): string {
    if (node.purchased) return 'purchased'
    if (!node.unlocked) return 'locked'
    if (!node.affordable) return 'unaffordable'
    return 'available'
  }

  function buy() {
    if (selectedId) game.treeActions?.purchase(selectedId)
  }
</script>

{#if open}
  <div class="overlay">
    <header>
      <h2>The Escapement Tree</h2>
      <span class="balance">{Math.floor(game.recollection)} Recollection</span>
      <button class="ghost" onclick={reset}>Recentre</button>
      <button
        class="ghost"
        disabled={game.treeRefund <= 0 || game.running}
        title={game.running ? 'Only between runs' : 'Refunds everything, free'}
        onclick={() => game.treeActions?.respec()}
      >
        Respec ({game.treeRefund})
      </button>
      <span class="hint"><kbd>T</kbd> to close · drag to pan · scroll to zoom</span>
    </header>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <svg
      class="canvas"
      class:dragging
      role="application"
      aria-label="Escapement Tree"
      onwheel={onWheel}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      bind:clientWidth={viewWidth}
      bind:clientHeight={viewHeight}
    >
      <g transform="translate({originX}, {originY}) scale({scale})">
        <g class="edges">
          {#each edges as edge (edge.from.id + '>' + edge.to.id)}
            <line
              x1={edge.from.x}
              y1={edge.from.y}
              x2={edge.to.x}
              y2={edge.to.y}
              class:done={edge.from.purchased && edge.to.purchased}
              class:planned={pathIds.has(edge.to.id)}
            />
          {/each}
        </g>

        {#each game.tree as node (node.id)}
          <g
            class="node {stateOf(node)}"
            class:planned={pathIds.has(node.id)}
            class:selected={node.id === selectedId}
            transform="translate({node.x}, {node.y})"
            role="button"
            tabindex="0"
            onclick={(e) => {
              e.stopPropagation()
              selectedId = node.id
            }}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') selectedId = node.id
            }}
          >
            <circle r="18" />
            <text class="label" y="34">{node.name}</text>
            {#if !node.purchased}
              <text class="cost" y="5">{node.cost}</text>
            {/if}
          </g>
        {/each}
      </g>
    </svg>

    <aside class="detail">
      {#if selected}
        <span class="branch {selected.branch}">
          {BRANCH_LABELS[selected.branch]} · tier {selected.tier}
        </span>
        <h3>{selected.name}</h3>
        <p class="voice">{selected.description}</p>

        <ul class="effects">
          {#each selected.effects as effect (effect.kind)}
            <li>{effectText(effect.kind, effect.magnitude)}</li>
          {/each}
        </ul>

        {#if selected.purchased}
          <p class="state done">Purchased.</p>
        {:else if path && path.ids.length > 1}
          <!-- The planning affordance: what the whole chain costs, not just
               this node, since the prerequisites are not optional. -->
          <p class="state">
            {path.ids.length} nodes · <strong>{path.total}</strong> Recollection
          </p>
          <p class="note">
            Requires {path.ids.length - 1} earlier{' '}
            {path.ids.length === 2 ? 'node' : 'nodes'}. Highlighted on the tree.
          </p>
          <button disabled={!selected.unlocked || !selected.affordable} onclick={buy}>
            {selected.unlocked ? `Buy for ${selected.cost}` : 'Locked'}
          </button>
        {:else}
          <p class="state"><strong>{selected.cost}</strong> Recollection</p>
          <button disabled={!selected.affordable} onclick={buy}>
            Buy for {selected.cost}
          </button>
        {/if}
      {:else}
        <p class="note">
          Four branches, wound outward from the centre. Select a node to see
          what it costs and what it needs first.
        </p>
      {/if}
    </aside>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(6, 6, 5, 0.94);
    display: grid;
    grid-template-columns: 1fr 19rem;
    grid-template-rows: auto 1fr;
    pointer-events: auto;
    z-index: 10;
  }

  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.9rem 1.25rem;
    border-bottom: 1px solid var(--brass-dim);
  }

  h2 {
    margin: 0;
    font-size: 0.85rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--brass);
  }

  .balance {
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }

  .hint {
    margin-left: auto;
    font-size: 0.7rem;
    color: var(--muted);
  }

  .canvas {
    width: 100%;
    height: 100%;
    cursor: grab;
    touch-action: none;
  }

  .canvas.dragging {
    cursor: grabbing;
  }

  .edges line {
    stroke: #2a2620;
    stroke-width: 2;
  }

  .edges line.done {
    stroke: var(--brass-dim);
  }

  .edges line.planned {
    stroke: var(--brass);
    stroke-dasharray: 4 3;
  }

  .node {
    cursor: pointer;
  }

  .node circle {
    fill: #14120e;
    stroke: #3a352a;
    stroke-width: 2;
  }

  .node.available circle {
    stroke: var(--brass);
  }

  .node.unaffordable circle {
    stroke: var(--brass-dim);
  }

  .node.purchased circle {
    fill: var(--brass);
    stroke: var(--brass);
  }

  .node.planned circle {
    stroke: var(--brass);
    stroke-dasharray: 3 2;
  }

  .node.selected circle {
    stroke: #f0e6c8;
    stroke-width: 3;
  }

  .node text {
    text-anchor: middle;
    fill: var(--muted);
    font-size: 0.62rem;
  }

  .node.available text.label,
  .node.purchased text.label {
    fill: var(--text);
  }

  .node text.cost {
    fill: var(--brass);
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
  }

  .node.locked text.cost {
    fill: #4a4438;
  }

  .detail {
    padding: 1rem 1.1rem;
    border-left: 1px solid var(--brass-dim);
    overflow-y: auto;
    font-size: 0.78rem;
  }

  .branch {
    display: block;
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .branch.regulation {
    color: #9fb0c8;
  }

  h3 {
    margin: 0.3rem 0 0.5rem;
    font-size: 0.95rem;
    color: var(--text);
  }

  .voice {
    margin: 0 0 0.8rem;
    color: var(--muted);
    line-height: 1.5;
    font-style: italic;
  }

  .effects {
    margin: 0 0 0.9rem;
    padding-left: 1rem;
    color: var(--brass);
  }

  .state {
    margin: 0 0 0.5rem;
    font-variant-numeric: tabular-nums;
  }

  .state.done {
    color: var(--brass);
  }

  .note {
    margin: 0 0 0.8rem;
    color: var(--muted);
    line-height: 1.45;
  }

  button {
    width: 100%;
    padding: 0.5rem;
    font: inherit;
    color: var(--bg);
    background: var(--brass);
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
  }

  button:disabled {
    background: #2a2620;
    color: var(--muted);
    cursor: default;
  }

  button.ghost {
    width: auto;
    padding: 0.3rem 0.7rem;
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--brass-dim);
    font-size: 0.72rem;
  }

  button.ghost:disabled {
    border-color: #2a2620;
  }

  kbd {
    display: inline-block;
    padding: 0 0.25rem;
    border: 1px solid var(--brass-dim);
    border-radius: 0.2rem;
  }
</style>
