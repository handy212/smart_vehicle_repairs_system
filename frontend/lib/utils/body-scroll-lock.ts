let lockCount = 0;
let savedOverflow = "";
let savedPaddingRight = "";

/** Lock page scroll while overlays (dialogs) are open. Supports nested overlays. */
export function lockBodyScroll(): void {
  if (typeof document === "undefined") return;

  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    savedPaddingRight = document.body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  lockCount += 1;
}

/** Release a body scroll lock acquired via lockBodyScroll(). */
export function unlockBodyScroll(): void {
  if (typeof document === "undefined") return;

  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPaddingRight;
  }
}
