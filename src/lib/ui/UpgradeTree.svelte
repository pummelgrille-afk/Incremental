<script lang="ts">
  import { game, type TreeNodeView } from '../stores/game.svelte'
  import type { UpgradeBranch } from '../entities/Upgrade'
  import type { ActionId } from '../content/keybindings'
  import { bindingLabel } from '../core/keybindings'
  import { content, plural, t } from '../stores/i18n.svelte'
  import Overlay from './primitives/Overlay.svelte'
  import Button from './primitives/Button.svelte'
  import Kbd from './primitives/Kbd.svelte'
  import Tooltip from './primitives/Tooltip.svelte'
  import T from './T.svelte'

  let { open = false }: { open?: boolean } = $props()

  const keyLabel = (action: ActionId) => bindingLabel(game.keybindings[action] ?? '')

  const BRANCH_LABELS: Record<UpgradeBranch, `branch.${UpgradeBranch}`> = {
    aperture: 'branch.aperture',
    shielding: 'branch.shielding',
    recovery: 'branch.recovery',
    regulation: 'branch.regulation',
  }

  const EFFECT_TERMS = new Set([
    'attack', 'haste', 'conjunctionPotency', 'output', 'defence', 'blockArc',
    'salvage', 'recollection', 'repairCost', 'flareCharges', 'flareRadius',
    'conjunctionTolerance',
  ])

  const FLAT = new Set(['output', 'flareCharges', 'flareRadius'])
  const ANGLE = new Set(['blockArc', 'conjunctionTolerance'])

  function effectText(kind: string, magnitude: number): string {
    const term = EFFECT_TERMS.has(kind) ? t(`effect.${kind}` as 'effect.attack') : kind
    if (ANGLE.has(kind)) {
      return t('almanac.effect.angle', {
        value: Math.round((magnitude * 180) / Math.PI),
        term,
      })
    }
    if (FLAT.has(kind)) return t('almanac.effect.flat', { value: magnitude, term })

    return t('almanac.effect.percent', {
      sign: kind === 'repairCost' ? '−' : '+',
      value: Math.round(magnitude * 100),
      term,
    })
  }

  let scale = $state(0.85)
  let panX = $state(0)
  let panY = $state(0)

  let viewWidth = $state(0)
  let viewHeight = $state(0)
  const originX = $derived(viewWidth / 2 + panX)
  const originY = $derived(viewHeight / 2 + panY)

  let dragging = $state(false)
  let dragFromX = 0
  let dragFromY = 0

  function onWheel(event: WheelEvent) {
    event.preventDefault()

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

  let selectedId = $state<string | null>(null)

  const selected = $derived(game.tree.find((n) => n.id === selectedId) ?? null)

  const path = $derived(
    selectedId && game.treeActions ? game.treeActions.preview(selectedId) : null,
  )

  const pathIds = $derived(new Set(path?.ids ?? []))

  const byId = $derived(new Map(game.tree.map((n) => [n.id, n])))

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

  let hovered = $state<{ node: TreeNodeView; anchor: DOMRect } | null>(null)

  function hover(node: TreeNodeView, event: PointerEvent): void {
    if (dragging) return
    hovered = { node, anchor: (event.currentTarget as Element).getBoundingClientRect() }
  }
</script>

<Overlay
  {open}
  title={t('term.almanac')}
  aside="19rem"
  balances={[{ label: t('term.recollection'), value: game.recollection }]}
>
  {#snippet controls()}
    <Button variant="ghost" small onclick={reset}>{t('almanac.recentre')}</Button>
    <Button
      variant="ghost"
      small
      disabled={game.treeRefund <= 0 || game.running}
      title={game.running ? t('almanac.respec.running') : t('almanac.respec.hint')}
      onclick={() => game.treeActions?.respec()}
    >
      {t('almanac.respec', { refund: game.treeRefund })}
    </Button>
  {/snippet}

  {#snippet hint()}
    <T key="almanac.hint">
      {#snippet close()}<Kbd>{keyLabel('tree')}</Kbd>{/snippet}
    </T>
  {/snippet}

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <svg
      class="canvas"
      class:dragging
      role="application"
      aria-label={t('term.almanac')}
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
            aria-label={content('upgrade', node.id, 'name', node.name)}
            onpointerdown={(e) => {
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

            <circle class="hit" r="18" />
            <path
              class="star"
              d="M 0 -13 Q 2.6 -2.6 13 0 Q 2.6 2.6 0 13 Q -2.6 2.6 -13 0 Q -2.6 -2.6 0 -13 Z"
            />
            <text class="label" y="30">{content('upgrade', node.id, 'name', node.name)}</text>
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
          {t('almanac.tier', {
            branch: t(BRANCH_LABELS[selected.branch]),
            tier: selected.tier,
          })}
        </span>
        <h3>{content('upgrade', selected.id, 'name', selected.name)}</h3>
        <p class="voice">
          {content('upgrade', selected.id, 'description', selected.description)}
        </p>

        <ul class="effects">
          {#each selected.effects as effect (effect.kind)}
            <li>{effectText(effect.kind, effect.magnitude)}</li>
          {/each}
        </ul>

        {#if selected.purchased}
          <p class="state done">{t('almanac.purchased')}</p>
        {:else if path && path.ids.length > 1}

          <p class="state">
            {t('almanac.path', { count: path.ids.length, total: path.total })}
          </p>
          <p class="note">{plural('almanac.path.note', path.ids.length - 1)}</p>
          <Button block disabled={!selected.unlocked || !selected.affordable} onclick={buy}>
            {selected.unlocked
              ? t('almanac.buy', { cost: selected.cost })
              : t('common.locked')}
          </Button>
        {:else}
          <p class="state">{t('almanac.cost', { cost: selected.cost })}</p>
          <Button block disabled={!selected.affordable} onclick={buy}>
            {t('almanac.buy', { cost: selected.cost })}
          </Button>
        {/if}
      {:else}
        <p class="note">{t('almanac.empty')}</p>
      {/if}
    </aside>

  {#if hovered}
    <Tooltip anchor={hovered.anchor} prefer="right" width={230}>
      <span class="card-branch">
        {t('almanac.tier', {
          branch: t(BRANCH_LABELS[hovered.node.branch]),
          tier: hovered.node.tier,
        })}
      </span>
      <h4>{content('upgrade', hovered.node.id, 'name', hovered.node.name)}</h4>
      <p class="card-voice">
        {content('upgrade', hovered.node.id, 'description', hovered.node.description)}
      </p>
      <p class="card-cost">
        {#if hovered.node.purchased}
          {t('almanac.purchased')}
        {:else}
          {t('almanac.cost', { cost: hovered.node.cost })}
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
