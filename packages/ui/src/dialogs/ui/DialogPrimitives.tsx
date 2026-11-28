import React, { useId } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Switch from '@radix-ui/react-switch';
import { X } from 'lucide-react';
import './dialog-primitives.css';

export interface DialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDark: boolean;
  title: React.ReactNode;
  icon?: React.ReactNode;
  ariaLabel?: string;
  closeAriaLabel?: string;
  maxWidth?: number;
  alignTop?: boolean;
  preventClose?: boolean;
  borderedHeader?: boolean;
  paddedBody?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export const DialogShell: React.FC<DialogShellProps> = ({
  open,
  onOpenChange,
  isDark,
  title,
  icon,
  ariaLabel,
  closeAriaLabel = 'Close',
  maxWidth = 460,
  alignTop = false,
  preventClose = false,
  borderedHeader = false,
  paddedBody = false,
  footer,
  children,
}) => {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && preventClose) return;
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="mt-dlg-overlay" />
        <Dialog.Content
          className={`mt-dlg-content${alignTop ? ' mt-dlg-content--top' : ''}`}
          data-theme={isDark ? 'dark' : 'light'}
          aria-label={ariaLabel}
          aria-describedby={undefined}
          style={{ maxWidth }}
          onEscapeKeyDown={(e) => {
            if (preventClose) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (preventClose) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (preventClose) e.preventDefault();
          }}
        >
          <div className={`mt-dlg-header${borderedHeader ? ' mt-dlg-header--bordered' : ''}`}>
            <Dialog.Title className="mt-dlg-title">
              {icon}
              <span>{title}</span>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="mt-dlg-close"
                aria-label={closeAriaLabel}
                disabled={preventClose}
              >
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>
          <div className={`mt-dlg-body${paddedBody ? ' mt-dlg-body--padded' : ''}`}>
            {children}
          </div>
          {footer && <div className="mt-dlg-footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export interface ToggleSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  size?: 'sm' | 'md';
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onCheckedChange,
  disabled = false,
  id,
  ariaLabel,
  size = 'md',
}) => (
  <Switch.Root
    id={id}
    checked={checked}
    onCheckedChange={onCheckedChange}
    disabled={disabled}
    aria-label={ariaLabel}
    className={`mt-switch${size === 'sm' ? ' mt-switch--sm' : ''}`}
  >
    <Switch.Thumb className="mt-switch-thumb" />
  </Switch.Root>
);

export interface DialogSwitchRowProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  bold?: boolean;
  title?: string;
  style?: React.CSSProperties;
}

export const DialogSwitchRow: React.FC<DialogSwitchRowProps> = ({
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  size = 'md',
  bold = false,
  title,
  style,
}) => {
  const id = useId();
  return (
    <label
      htmlFor={id}
      title={title}
      className={`mt-dlg-switch-row${disabled ? ' mt-dlg-switch-row--disabled' : ''}`}
      style={{ fontWeight: bold ? 600 : 400, ...style }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span>{label}</span>
        {description && (
          <span style={{ fontSize: 11.5, color: 'var(--mt-muted-fg)', fontWeight: 400 }}>
            {description}
          </span>
        )}
      </div>
      <ToggleSwitch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        size={size}
      />
    </label>
  );
};

export interface DialogButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md';
}

export const DialogButton: React.FC<DialogButtonProps> = ({
  variant = 'outline',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    className={`mt-dlg-btn mt-dlg-btn--${variant}${size === 'sm' ? ' mt-dlg-btn--sm' : ''}${
      className ? ` ${className}` : ''
    }`}
    {...rest}
  />
);

export const DialogSeparator: React.FC = () => <hr className="mt-dlg-separator" />;
