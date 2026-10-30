// moves a node to the end of the body. a dialog opened from inside a panel
// that is a size container, like the admin dock, would otherwise be framed
// and clipped by that panel instead of covering the page
export function portal(node: HTMLElement): { destroy(): void } {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    }
  };
}
