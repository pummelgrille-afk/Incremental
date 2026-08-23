<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { MessageKey } from '../i18n/en'
  import type { MessageParams } from '../i18n/translate'
  import { parseMessage } from '../i18n/parts'
  import { raw } from '../stores/i18n.svelte'

  let {
    key,
    values,
    ...slots
  }: {
    key: MessageKey
    values?: MessageParams
    [name: string]: unknown
  } = $props()

  const parts = $derived(parseMessage(raw(key)))

  const snippetFor = (name: string): Snippet | undefined =>
    typeof slots[name] === 'function' ? (slots[name] as Snippet) : undefined
</script>

{#each parts as part, i (i)}{#if 'text' in part}{part.text}{:else if snippetFor(part.name)}{@render snippetFor(part.name)!()}{:else}{values?.[part.name] ?? `{${part.name}}`}{/if}{/each}
