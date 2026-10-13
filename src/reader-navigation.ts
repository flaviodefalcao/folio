export type TocItem = { label: string; href: string };
function filePart(href: string) {
  try {
    return decodeURIComponent(href.split(/[?#]/)[0]).replace(/^\//, "");
  } catch {
    return href.split(/[?#]/)[0];
  }
}
/** Resolves the visible chapter by DOM position, including EPUBs with many anchors in one spine item. */
export function resolveTocLocation(
  toc: TocItem[],
  href: string,
  location: Range | undefined,
  endLocation?: Range,
  preferredHref?: string | null,
): TocItem | undefined {
  const file = filePart(href);
  const candidates = toc.filter((t) => {
    const target = filePart(t.href);
    return (
      target === file ||
      file.endsWith("/" + target) ||
      target.endsWith("/" + file)
    );
  });
  if (!location) return candidates[0];
  const doc = location.startContainer.ownerDocument;
  if (!doc) return candidates[0];
  let current: TocItem | undefined, best: Range | undefined;
  for (const item of candidates) {
    const fragment = item.href.split("#")[1];
    let anchor: Element | null = doc.body;
    if (fragment) {
      try {
        const id = decodeURIComponent(fragment);
        anchor = doc.getElementById(id) || doc.getElementsByName(id)[0] || null;
      } catch {
        continue;
      }
    }
    if (!anchor) continue;
    const position = doc.createRange();
    position.selectNodeContents(anchor);
    position.collapse(true);
    try {
      if (
        item.href === preferredHref &&
        position.compareBoundaryPoints(0, location) >= 0 &&
        endLocation &&
        position.compareBoundaryPoints(0, endLocation) <= 0
      )
        return item;
      if (
        position.compareBoundaryPoints(0, endLocation || location) <= 0 &&
        (!best || position.compareBoundaryPoints(0, best) >= 0)
      ) {
        current = item;
        best = position;
      }
    } catch {}
  }
  return current || candidates[0];
}
