import { useState, useCallback } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const confirmClasses =
    variant === "danger"
      ? "bg-danger-muted text-danger-fg hover:bg-danger-muted/80 border-danger-muted"
      : "bg-warning-muted text-warning-fg hover:bg-warning-muted/80 border-warning-muted";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md rounded-lg border border-white/[0.06] bg-surface-2 p-6 shadow-xl animate-slide-up">
        <div className="flex items-start gap-4">
          <div className={`rounded-full p-2 ${variant === "danger" ? "bg-danger-muted/50" : "bg-warning-muted/50"}`}>
            <AlertTriangle className={`size-5 ${variant === "danger" ? "text-danger-fg" : "text-warning-fg"}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-md p-1 text-muted-foreground hover:bg-surface-3 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="h-9 rounded-lg border border-white/[0.08] bg-surface-3 px-4 text-sm font-medium text-foreground hover:bg-surface-4"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`h-9 rounded-lg border px-4 text-sm font-medium ${confirmClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConfirmConfig {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  variant?: "danger" | "warning";
}

export function useConfirmDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<ConfirmConfig | null>(null);

  const confirm = useCallback(
    (options: ConfirmConfig) => {
      setConfig(options);
      setIsOpen(true);
    },
    []
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setConfig(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (config) {
      config.onConfirm();
    }
    close();
  }, [config, close]);

  const dialog = config ? (
    <ConfirmDialog
      isOpen={isOpen}
      title={config.title}
      message={config.message}
      confirmLabel={config.confirmLabel}
      cancelLabel={config.cancelLabel}
      variant={config.variant}
      onConfirm={handleConfirm}
      onCancel={close}
    />
  ) : null;

  return { confirm, dialog };
}
