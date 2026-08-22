<script lang="ts">
  import { game, type TreeNodeView } from '../stores/game.svelte'
  import type { UpgradeBranch } from '../entities/Upgrade'
  import Overlay from './primitives/Overlay.svelte'
  import Button from './primitives/Button.svelte'
  import Kbd from './primitives/Kbd.svelte'
  import Tooltip from './primitives/Tooltip.svelte'

  /**
   * The Almanac.
   *
   * Node positions are derived in `progression/upgradeTree.ts`, not authored —
   * radial, because the game is an perihelion, and because the layout has to stay
   * legible when Phase 34 grows it from twelve nodes to seventy-two.
   *
   * Each arm is drawn as a **constellation**: stars where the nodes sit, the
   * prerequisite edges as the lines between them. The irregularity is in the
   * layout rather than here — this file only decides that a node looks like a
   * star and that a purchased one is lit.
   *
   * Drawn as SVG rather than Pixi: this is a menu, not the field. It wants
   * crisp text and hit-testing at any zoom, and it must never compete with the
   * simulation for the render budget.
   */

  let { open = false }: { open?: boolean } = $props()

  const BRANCH_LABELS: Record<UpgradeBranch, string> = {
    aperture: 'Aperture',
    shielding: 'Shielding',
    recovery: 'Recovery',
    regulation: 'Regulation',
  }

  const EFFECT_LABELS: Record<string, string> = {
    attack: 'attack',
    haste: 'attack speed',
    conjunctionPotency: 'conjunction potency',
    output: 'Output',
    defence: 'defence',
    blockArc: 'block arc',
    salvage: 'Salvage',
    recollection: 'Recollection',
    repairCost: 'repair cost',
    flareCharges: 'Flare charges',
    flareRadius: 'blast radius',
    conjunctionTolerance: 'conjunction window',
  }

  /** Flat counts read as counts; everything else reads as a percentage. */
  const FLAT = new Set(['output', 'flareCharges', 'flareRadius'])
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

  // --- Hover. ---------------------------------------------------------------

  /**
   * What the pointer is over, if anything.
   *
   * Separate from the selection on purpose. Reading what a node is used to
   * *cost* you your selection — and the selection is the planning state, the
   * thing holding the highlighted path across the tree. Browsing had to
   * destroy planning, which is backwards.
   *
   * Suppressed while panning: a card following the tree as it slides under the
   * pointer is unreadable, and it is not what the player is doing.
   */
  let hovered = $state<{ node: TreeNodeView; anchor: DOMRect } | null>(null)

  function hover(node: TreeNodeView, event: PointerEvent): void {
    if (dragging) return
    hovered = { node, anchor: (event.currentTarget as Element).getBoundingClientRect() }
  }
</script>

<Overlay
  {open}
  title="The Almanac"
  aside="19rem"
  balances={[{ label: 'Recollection', value: game.recollection }]}
>
  {#snippet controls()}
    <Button variant="ghost" small onclick={reset}>Recentre</Button>
    <Button
      variant="ghost"
      small
      disabled={game.treeRefund <= 0 || game.running}
      title={game.running ? 'Only between runs' : 'Refunds everything, free'}
      onclick={() => game.treeActions?.respec()}
    >
      Respec ({game.treeRefund})
    </Button>
  {/snippet}

  {#snippet hint()}
    <Kbd>T</Kbd> to close · drag to pan · scroll to zoom
  {/snippet}

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <svg
      class="canvas"
      class:dragging
      role="application"
      aria-label="Almanac"
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
            aria-label={node.name}
            onpointerdown={(e) => {
              /*
               * Selection happens on pointer*down*, and the event stops here.
               *
               * The canvas calls `setPointerCapture` on itself to pan, which
               * retargets every following mouse event — including the `click`
               * — to the canvas. A click on a node therefore never reached the
               * node, and the only way to select one was to tab to it and
               * press Enter. Stopping the event before the canvas sees it
               * fixes the cause rather than the symptom; the cost is that a
               * drag cannot start on top of a node, which is a fair trade for
               * a node that can be clicked.
               */
              e.stopPropagation()
              selectedId = node.id
            }}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') selectedId = node.id
            }}
            onpointerenter={(e) => hover(node, e)}
            onpointerleave={() => (hovered = null)}
            onfocus={(e) => hover(node, e as unknown as PointerEvent)}
            onblur={() => (hovered = null)}
          >
            <!-- A star, not a disc: four points on the axes with a soft waist,
                 which is the shape the eye reads as a star at this size. The
                 wide invisible disc under it keeps the click target generous
                 without drawing a circle around every point. -->
            <circle class="hit" r="18" />
            <path
              class="star"
              d="M 0 -13 Q 2.6 -2.6 13 0 Q 2.6 2.6 0 13 Q -2.6 2.6 -13 0 Q -2.6 -2.6 0 -13 Z"
            />
            <text class="label" y="30">{node.name}</text>
            {#if !node.purchased}
              <text class="cost" y="-19">{node.cost}</text>
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
          <Button block disabled={!selected.unlocked || !selected.affordable} onclick={buy}>
            {selected.unlocked ? `Buy for ${selected.cost}` : 'Locked'}
          </Button>
        {:else}
          <p class="state"><strong>{selected.cost}</strong> Recollection</p>
          <Button block disabled={!selected.affordable} onclick={buy}>
            Buy for {selected.cost}
          </Button>
        {/if}
      {:else}
        <p class="note">
          Four branches, wound outward from the centre. Select a node to see
          what it costs and what it needs first.
        </p>
      {/if}
    </aside>

  {#if hovered}
    <Tooltip anchor={hovered.anchor} prefer="right" width={230}>
      <span class="card-branch">
        {BRANCH_LABELS[hovered.node.branch]} · tier {hovered.node.tier}
      </span>
      <h4>{hovered.node.name}</h4>
      <p class="card-voice">{hovered.node.description}</p>
      <p class="card-cost">
        {#if hovered.node.purchased}
          Purchased.
        {:else}
          <strong>{hovered.node.cost}</strong> Recollection
        {/if}
      </p>
    </Tooltip>
  {/if}
</Overlay>

<style>
  .canvas {
    width: 100%;
    height: 100%;
    cursor: grab;
    touch-action: none;
  }

  .canvas.dragging {
    cursor: grabbing;
  }

  /* Thin, so the lines read as the joins of a constellation rather than as
     pipework. A purchased chain is the one that brightens. */
  .edges line {
    stroke: var(--inert);
    stroke-width: 1;
  }

  .edges line.done {
    stroke: var(--corona-dim);
    stroke-width: 1.5;
  }

  .edges line.planned {
    stroke: var(--corona);
    stroke-dasharray: 4 3;
  }

  .node {
    cursor: pointer;
  }

  /* The hit target. Invisible, and wider than the star it sits under. */
  .node circle.hit {
    fill: transparent;
    stroke: none;
  }

  .node .star {
    fill: #14120e;
    stroke: #3a352a;
    stroke-width: 2;
  }

  .node.available .star {
    stroke: var(--corona);
    fill: #241f14;
  }

  .node.unaffordable .star {
    stroke: var(--corona-dim);
  }

  /* A purchased node is a lit star: filled, and the only thing on the canvas
     that glows. It is how an invested arm reads as invested from across the
     panel, without a legend. */
  .node.purchased .star {
    fill: var(--corona);
    stroke: #f0e6c8;
    filter: drop-shadow(0 0 5px rgba(214, 178, 70, 0.75));
  }

  .node.planned .star {
    stroke: var(--corona);
    stroke-dasharray: 3 2;
  }

  .node.selected .star {
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
    fill: var(--corona);
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
  }

  .node.locked text.cost {
    fill: #4a4438;
  }

  .detail {
    padding: 1rem 1.1rem;
    border-left: 1px solid var(--corona-dim);
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
    color: var(--corona);
  }

  .state {
    margin: 0 0 0.5rem;
    font-variant-numeric: tabular-nums;
  }

  .state.done {
    color: var(--corona);
  }

  .note {
    margin: 0 0 0.8rem;
    color: var(--muted);
    line-height: 1.45;
  }

  /* The hover card. Terser than the detail column on purpose: it answers
     "what is this" while the column answers "what does it take". */
  .card-branch {
    display: block;
    font-size: 0.6rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }

  h4 {
    margin: 0.2rem 0 0.35rem;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text);
  }

  .card-voice {
    margin: 0 0 0.5rem;
    color: var(--muted);
    font-size: 0.72rem;
    line-height: 1.45;
  }

  .card-cost {
    margin: 0;
    font-size: 0.72rem;
    color: var(--corona);
    font-variant-numeric: tabular-nums;
  }
</style>
