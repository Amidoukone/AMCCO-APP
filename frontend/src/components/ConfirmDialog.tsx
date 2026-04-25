import { useEffect, useId } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  objectName: string;
  impactText: string;
  objectLabel?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  isConfirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  objectName,
  impactText,
  objectLabel = "Élément concerné",
  cancelLabel = "Annuler",
  confirmLabel = "Confirmer",
  isConfirming = false,
  onCancel,
  onConfirm
}: ConfirmDialogProps): JSX.Element | null {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" && !isConfirming) {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isConfirming, onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="confirm-dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isConfirming) {
          onCancel();
        }
      }}
    >
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <p className="confirm-dialog-eyebrow">Confirmation requise</p>
        <h3 id={titleId}>{title}</h3>
        <p id={descriptionId} className="confirm-dialog-description">
          {description}
        </p>
        <div className="confirm-dialog-object">
          <span className="confirm-dialog-object-label">{objectLabel}</span>
          <strong>{objectName}</strong>
        </div>
        <p className="confirm-dialog-impact">{impactText}</p>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={onCancel}
            disabled={isConfirming}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="danger-btn"
            onClick={onConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? "Traitement..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
