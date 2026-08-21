<script lang="ts">
  // Placeholder shell. Phase 10 replaces this with the vertical slice; the real
  // UI lands in src/lib/ui/ from Phase 42. Nothing here is load-bearing.
</script>

<main>
  <h1>The Orrery</h1>
  <p>Stage 0 complete — design foundation in <code>docs/design/</code>.</p>
  <p class="next">Next: Phase 7 — rendering approach and persistence target.</p>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
    text-align: center;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--brass);
  }

  p {
    margin: 0;
    color: var(--muted);
  }

  .next {
    font-size: 0.85rem;
    color: var(--brass-dim);
  }
</style>
