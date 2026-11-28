import React from 'react';
import { EyeOff, Trash2 } from 'lucide-react';
import { useI18n } from '../../i18n';
import { DialogButton, DialogShell, DialogSwitchRow } from '../../dialogs/ui/DialogPrimitives';
import type {
  PendingDeleteColState,
  PendingDeleteRowsState,
  PendingHideColState,
} from '../types';

export interface EditorConfirmDialogsProps {
  isDark: boolean;
  toolbarBorder: string;
  toolbarFg: string;
  btnStyle: React.CSSProperties;
  pendingDeleteRows: PendingDeleteRowsState | null;
  onCancelDeleteRows: () => void;
  onConfirmDeleteRows: (target: PendingDeleteRowsState) => void;
  pendingDeleteCol: PendingDeleteColState | null;
  onCancelDeleteCol: () => void;
  onConfirmDeleteCol: (target: PendingDeleteColState) => void;
  pendingHideCol: PendingHideColState | null;
  onChangeHideColDontShow: (checked: boolean) => void;
  onCancelHideCol: () => void;
  onConfirmHideCol: (target: PendingHideColState) => void;
}

export const EditorConfirmDialogs: React.FC<EditorConfirmDialogsProps> = ({
  isDark,
  pendingDeleteRows,
  onCancelDeleteRows,
  onConfirmDeleteRows,
  pendingDeleteCol,
  onCancelDeleteCol,
  onConfirmDeleteCol,
  pendingHideCol,
  onChangeHideColDontShow,
  onCancelHideCol,
  onConfirmHideCol,
}) => {
  const { t } = useI18n();

  return (
    <>
      <DialogShell
        open={Boolean(pendingDeleteRows)}
        onOpenChange={(next) => {
          if (!next) onCancelDeleteRows();
        }}
        isDark={isDark}
        title={t('confirm.deleteRowsTitle')}
        icon={<Trash2 size={15} style={{ color: '#ef4444' }} />}
        ariaLabel={t('confirm.deleteRowsTitle')}
        maxWidth={400}
        footer={
          <>
            <DialogButton variant="outline" autoFocus onClick={onCancelDeleteRows}>
              {t('common.cancel')}
            </DialogButton>
            <DialogButton
              variant="destructive"
              onClick={() => pendingDeleteRows && onConfirmDeleteRows(pendingDeleteRows)}
            >
              {t('confirm.deleteConfirm')}
            </DialogButton>
          </>
        }
      >
        {pendingDeleteRows && (
          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--mt-muted-fg)' }}>
            {t('confirm.deleteMessage', { label: pendingDeleteRows.label })}
          </div>
        )}
      </DialogShell>

      <DialogShell
        open={Boolean(pendingDeleteCol)}
        onOpenChange={(next) => {
          if (!next) onCancelDeleteCol();
        }}
        isDark={isDark}
        title={t('confirm.deleteColsTitle')}
        icon={<Trash2 size={15} style={{ color: '#ef4444' }} />}
        ariaLabel={t('confirm.deleteColsTitle')}
        maxWidth={400}
        footer={
          <>
            <DialogButton variant="outline" autoFocus onClick={onCancelDeleteCol}>
              {t('common.cancel')}
            </DialogButton>
            <DialogButton
              variant="destructive"
              onClick={() => pendingDeleteCol && onConfirmDeleteCol(pendingDeleteCol)}
            >
              {t('confirm.deleteConfirm')}
            </DialogButton>
          </>
        }
      >
        {pendingDeleteCol && (
          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--mt-muted-fg)' }}>
            {t('confirm.deleteMessage', { label: pendingDeleteCol.label })}
          </div>
        )}
      </DialogShell>

      <DialogShell
        open={Boolean(pendingHideCol)}
        onOpenChange={(next) => {
          if (!next) onCancelHideCol();
        }}
        isDark={isDark}
        title={t('confirm.hideColTitle')}
        icon={<EyeOff size={15} />}
        ariaLabel={t('confirm.hideColTitle')}
        maxWidth={420}
        footer={
          <>
            <DialogButton variant="outline" onClick={onCancelHideCol}>
              {t('common.cancel')}
            </DialogButton>
            <DialogButton
              variant="primary"
              onClick={() => pendingHideCol && onConfirmHideCol(pendingHideCol)}
            >
              {t('confirm.hideConfirm')}
            </DialogButton>
          </>
        }
      >
        {pendingHideCol && (
          <>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--mt-muted-fg)' }}>
              {t('confirm.hideColMessage', { label: pendingHideCol.label })}
              <br />
              {t('confirm.hideColHint')}
            </div>
            <DialogSwitchRow
              size="sm"
              label={t('confirm.dontShowAgain')}
              checked={pendingHideCol.dontShowAgain}
              onCheckedChange={onChangeHideColDontShow}
              style={{ fontSize: 12.5 }}
            />
          </>
        )}
      </DialogShell>
    </>
  );
};
