import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Settings as SettingsIcon, Mail, Sun, Moon, Shield, UserX, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    base44.auth.me().then(u => { setUser(u); setLoadingUser(false); }).catch(() => setLoadingUser(false));
  }, []);

  const handleSubmitEmailChange = async () => {
    setSubmitting(true);
    try {
      await base44.functions.invoke('requestEmailChange', { newEmail });
      setSubmitted(true);
    } catch (e) {
      // error handled silently
    }
    setSubmitting(false);
  };

  const closeEmailDialog = () => {
    setEmailDialogOpen(false);
    setNewEmail('');
    setSubmitted(false);
  };

  return (
    <div className="pb-24 lg:pb-8">
      <div className="mb-8">
        <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
          <SettingsIcon className="w-7 h-7 text-primary" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">Manage your account, appearance, and preferences.</p>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* Account / Email */}
        <div className="bg-card rounded-2xl border border-border/50 p-5 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-heading text-lg font-semibold">Account Email</h2>
              <p className="text-xs text-muted-foreground">Your email cannot be changed directly, but you can request a change.</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Current Email</Label>
              <Input value={loadingUser ? 'Loading...' : (user?.email || 'N/A')} readOnly className="mt-1 bg-muted/50 cursor-not-allowed" />
            </div>
            <Button variant="outline" onClick={() => setEmailDialogOpen(true)} className="gap-2">
              <Send className="w-4 h-4" /> Request Email Change
            </Button>
          </div>
        </div>

        {/* Appearance */}
        <div className="bg-card rounded-2xl border border-border/50 p-5 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              {theme === 'dark' ? <Moon className="w-5 h-5 text-accent" /> : <Sun className="w-5 h-5 text-accent" />}
            </div>
            <div>
              <h2 className="font-heading text-lg font-semibold">Appearance</h2>
              <p className="text-xs text-muted-foreground">Choose how GenCare looks to you.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setTheme('light')}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                theme === 'light' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
              }`}
            >
              <Sun className="w-5 h-5 text-amber-500" />
              <span className="font-medium text-sm">Light</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                theme === 'dark' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
              }`}
            >
              <Moon className="w-5 h-5 text-indigo-500" />
              <span className="font-medium text-sm">Dark</span>
            </button>
          </div>
        </div>

        {/* Links */}
        <div className="bg-card rounded-2xl border border-border/50 p-5 md:p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">Legal & Account</h2>
          <div className="space-y-2">
            <Link to="/privacy-policy" className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <Shield className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">Privacy Policy</p>
                <p className="text-xs text-muted-foreground">How we handle your data</p>
              </div>
            </Link>
            <Link to="/account-management" className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors">
              <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                <UserX className="w-4 h-4 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">Account Management</p>
                <p className="text-xs text-muted-foreground">Delete your data or account</p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Email Change Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={closeEmailDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Request Email Change</DialogTitle>
            <DialogDescription>Enter the new email you'd like to use. Our team will review and process your request.</DialogDescription>
          </DialogHeader>
          {submitted ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-primary" />
              <p className="font-medium">Request Submitted</p>
              <p className="text-sm text-muted-foreground">We've received your request to change your email to <strong>{newEmail}</strong>. A confirmation has been sent to your current email.</p>
              <Button onClick={closeEmailDialog} className="mt-2">Done</Button>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <div>
                <Label>New Email Address</Label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="new.email@example.com"
                  className="mt-1"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={closeEmailDialog}>Cancel</Button>
                <Button
                  onClick={handleSubmitEmailChange}
                  disabled={!newEmail.includes('@') || submitting}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Request'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}