import { workspace } from '@/lib/workspace';
('use client');
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Session } from '@/lib/diagnostic/types';
import { sessionTitle } from '@/lib/diagnostic/session';
export function SessionManager({
  session,
  onClose,
  onChange,
  onDelete,
}: {
  session: Session | null;
  onClose: () => void;
  onChange: (s: Session) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(session ? sessionTitle(session) : ''),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save(remove = false) {
    if (!session || busy) return;
    setBusy(true);
    setError('');
    try {
      if (remove) {
        await workspace.remove(session.id);
        onDelete(session.id);
      } else onChange(await workspace.update(session.id, { title }));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={Boolean(session)}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {confirm ? 'Delete this conversation?' : 'Manage conversation'}
          </DialogTitle>
          <DialogDescription>
            {confirm
              ? 'This permanently removes the conversation, its reports and associated images. This cannot be undone.'
              : 'Give this diagnosis a short title (up to five words).'}
          </DialogDescription>
        </DialogHeader>
        {confirm ? (
          <div className="manage-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Cancel
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={() => void save(true)}
            >
              Delete conversation
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="field-label" htmlFor="session-title">
              Conversation title
            </label>
            <input
              id="session-title"
              className="title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={90}
            />
            <div className="manage-actions">
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => setConfirm(true)}
              >
                Delete…
              </button>
              <button
                type="submit"
                className="primary"
                disabled={busy || !title.trim()}
              >
                Save title
              </button>
            </div>
          </form>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
