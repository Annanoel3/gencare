import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { UserX, Trash2, ArrowLeft, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function AccountManagement() {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(null);
  const [action, setAction] = useState(null);
  const [done, setDone] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleConfirm = async () => {
    setAction('loading');
    try {
      await base44.functions.invoke('deleteUserData', { mode: confirmOpen });
      setDone(true);
    } catch (e) {
      // handled silently
    }
    setAction(null);
  };

  const handleClose = () => {
    setConfirmOpen(null);
    setConfirmText('');
    if (done) {
      if (confirmOpen === 'account') {
        base44.auth.logout();
      } else {
        navigate('/settings');
      }
    }
    setDone(false);
  };

  return (
    <div className="pb-24 lg:pb-8 max-w-2xl">
      <div className="mb-8">
        <Link to="/settings" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Settings
        </Link>
        <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
          <UserX className="w-7 h-7 text-destructive" />
          Account Management
        </h1>
        <p className="text-muted-foreground mt-1">Manage or remove your data and account. These actions are permanent and cannot be undone.</p>
      </div>

      <div className="space-y-4">
        {/* Delete Data */}
        <div className="bg-card rounded-2xl border border-border/50 p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <Trash2 className="w-6 h-6 text-amber-500" />
            </div>
            <div className="flex-1">
              <h2 className="font-heading text-lg font-semibold">Delete My Data</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                This permanently removes all family members, medications, appointments, tasks, journals, messages, checklists, and notes you've created. Your account and login remain active.
              </p>
              <Button variant="outline" className="gap-2 border-amber-500/50 text-amber-600 hover:bg-amber-500/10" onClick={() => setConfirmOpen('data')}>
                <Trash2 className="w-4 h-4" /> Delete My Data
              </Button>
            </div>
          </div>
        </div>

        {/* Delete Account */}
        <div className="bg-card rounded-2xl border-2 border-destructive/30 p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <UserX className="w-6 h-6 text-destructive" />
            </div>
            <div className="flex-1">
              <h2 className="font-heading text-lg font-semibold">Delete My Account</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                This permanently removes all your data and signs you out. Your account login will no longer have access to GenCare. A confirmation email will be sent to your registered address.
              </p>
              <Button variant="destructive" className="gap-2" onClick={() => setConfirmOpen('account')}>
                <UserX className="w-4 h-4" /> Delete My Account
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Warning:</strong> Once deleted, your data cannot be recovered. Please export or save any important information before proceeding.
          </p>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen !== null} onOpenChange={() => !action && handleClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl text-destructive">
              {confirmOpen === 'account' ? 'Delete Account?' : 'Delete All Data?'}
            </DialogTitle>
            <DialogDescription>
              {confirmOpen === 'account'
                ? 'This will permanently delete all your data and sign you out. Type DELETE to confirm.'
                : 'This will permanently delete all family care data you have created. Type DELETE to confirm.'}
            </DialogDescription>
          </DialogHeader>
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-primary" />
              <p className="font-medium">
                {confirmOpen === 'account' ? 'Account Deleted' : 'Data Deleted'}
              </p>
              <p className="text-sm text-muted-foreground">
                {confirmOpen === 'account'
                  ? 'Your data has been removed. You will be signed out.'
                  : 'All your data has been permanently removed.'}
              </p>
              <Button onClick={handleClose} className="mt-2">Continue</Button>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
              />
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={handleClose} disabled={action === 'loading'}>Cancel</Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirm}
                  disabled={confirmText !== 'DELETE' || action === 'loading'}
                >
                  {action === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Delete'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}