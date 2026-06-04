import { useCanvasStore } from './store';

/** Matches `<tag_name>` placeholders in a template string. */
export const TAG_RE = /<([a-zA-Z_][a-zA-Z0-9_]*)>/g;

/** Unique tag names in a template, in order of first appearance. */
export function templateTags(template: string): string[] {
  const seen: string[] = [];
  for (const m of template.matchAll(TAG_RE)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

/**
 * Resolve the prompt text a node emits: a Prompt node's positive text, or a
 * Template node's string with each <tag> filled from its connected input
 * (recursively) or its default. Guards against cycles.
 */
export function resolvePromptText(nodeId: string, seen: Set<string> = new Set()): string {
  if (seen.has(nodeId)) return '';
  seen.add(nodeId);
  const { nodes, edges } = useCanvasStore.getState();
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return '';
  if (node.type === 'prompt') return (node.data.positive as string) || '';
  if (node.type === 'template') {
    const tpl = (node.data.template as string) || '';
    const defaults = (node.data.tagDefaults as Record<string, string>) || {};
    return tpl.replace(TAG_RE, (_, tag) => {
      const edge = edges.find((e) => e.target === nodeId && e.targetHandle === `tag_${tag}`);
      if (edge) return resolvePromptText(edge.source, new Set(seen));
      return defaults[tag] ?? '';
    });
  }
  return '';
}
