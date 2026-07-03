function handleHorizontalWheel(event: WheelEvent): void {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;
  if (target.scrollWidth <= target.clientWidth) return;

  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (delta === 0) return;

  const maxScrollLeft = target.scrollWidth - target.clientWidth;
  const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, target.scrollLeft + delta));
  if (nextScrollLeft === target.scrollLeft) return;

  event.preventDefault();
  target.scrollLeft = nextScrollLeft;
}

export { handleHorizontalWheel };
