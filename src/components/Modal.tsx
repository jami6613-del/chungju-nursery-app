import React from "react";

export function Modal({
  open,
  title,
  children,
  onClose,
  titleSize = "md",
}: {
  open: boolean;
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
  titleSize?: "md" | "lg";
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4">
      <div className="min-w-0 w-full max-w-lg rounded-xl border border-slate-700 bg-slate-950 shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 sm:px-4 sm:py-3">
          <div className={`min-w-0 truncate font-semibold ${titleSize === "lg" ? "text-base sm:text-xl" : "text-sm sm:text-base"}`}>{title ?? ""}</div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 rounded-lg text-slate-200 hover:bg-slate-800 px-2 py-1.5 text-sm sm:px-3 sm:py-2 sm:text-base"
          >
            닫기
          </button>
        </div>
        <div className="min-w-0 max-h-[85vh] overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">{children}</div>
      </div>
    </div>
  );
}

