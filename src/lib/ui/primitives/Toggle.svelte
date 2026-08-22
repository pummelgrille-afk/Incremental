<script lang="ts">
  /**
   * An on/off switch.
   *
   * A real checkbox underneath, visually hidden rather than replaced. The
   * switch a player sees is drawn from it with a sibling selector, so keyboard
   * focus, Space to toggle, the label association and every assistive
   * technology on earth keep working — none of which a div with a click handler
   * gets, and all of which this phase is specifically about.
   */

  interface Props {
    id: string
    checked: boolean
    onchange: (value: boolean) => void
    /** Read out when the visible label is not enough on its own. */
    label?: string
  }

  let { id, checked, onchange, label }: Props = $props()
</script>

<span class="toggle">
  <input
    {id}
    type="checkbox"
    role="switch"
    aria-label={label}
    {checked}
    onchange={(e) => onchange(e.currentTarget.checked)}
  />
  <span class="track" aria-hidden="true"><span class="knob"></span></span>
</span>

<style>
  .toggle {
    position: relative;
    display: inline-flex;
  }

  /* Hidden from sight, never from the keyboard or the accessibility tree. */
  input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .track {
    display: block;
    width: 2.2rem;
    height: 1.1rem;
    padding: 2px;
    background: var(--well);
    border: 1px solid var(--corona-dim);
    border-radius: 999px;
    transition: background 120ms linear, border-color 120ms linear;
  }

  .knob {
    display: block;
    width: 0.8rem;
    height: 0.8rem;
    background: var(--muted);
    border-radius: 50%;
    transition: transform 120ms ease-out, background 120ms linear;
  }

  input:checked + .track {
    background: rgba(201, 162, 39, 0.25);
    border-color: var(--corona);
  }

  input:checked + .track .knob {
    background: var(--corona);
    transform: translateX(1.1rem);
  }

  input:focus-visible + .track {
    outline: 2px solid var(--corona);
    outline-offset: 2px;
  }
</style>
