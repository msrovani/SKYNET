export function simpleTokenize(text: string): number[] {
  const TOKEN_BASE = 1000;
  return text.split(/\s+/).filter(Boolean).map((w, i) => {
    let hash = 0;
    for (let j = 0; j < w.length; j++) hash = (hash * 31 + w.charCodeAt(j)) & 0x7fffffff;
    return (hash % 32000) + (i * 7) % 32000;
  });
}
