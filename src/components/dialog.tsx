"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Native <dialog> so focus trapping, Esc, and inertness come from the platform
 * rather than being re-implemented (and got subtly wrong) here.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-ink shadow-2xl backdrop:bg-[#14213d]/45 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full px-2 py-1 text-muted transition hover:bg-surface-2 hover:text-ink"
        >
          ✕
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
      {footer && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
          {footer}
        </div>
      )}
    </dialog>
  );
}
