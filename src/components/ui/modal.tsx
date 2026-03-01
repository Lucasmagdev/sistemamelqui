import { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-xl shadow-xl p-6 w-full max-w-md relative animate-fade-in">
        {title && <h2 className="text-lg font-bold mb-4 text-foreground">{title}</h2>}
        {children}
        <button
          className="absolute top-3 right-3 text-muted-foreground hover:text-primary"
          onClick={onClose}
          aria-label="Fechar"
        >
          x
        </button>
      </div>
    </div>
  );
}

