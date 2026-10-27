// moves a node to the end of the body. the dock is a size container, which
// makes it the frame of anything fixed inside it, so a dialog opened from a
// tab would be clipped to the dock without this
export function portal(node: HTMLElement): { destroy(): void } {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    }
  };
}
