import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { TEXT_SIZES, BIG, savedTextSize, setTextSize } from '@/lib/textSize';
import MissingNote from '@/components/shared/MissingNote';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Settings as SettingsIcon, Mail, Sun, Moon, Smartphone, Shield, UserX, Send, Loader2, CheckCircle2, Users, FileText, LifeBuoy, Bug, Activity as ActivityIcon, LogOut, MessageCircleHeart, CircleHelp, ChevronRight, Star, Share2 } from 'lucide-react';
import SupportDialog from '@/components/shared/SupportDialog';
import { previewWelcome } from '@/components/onboarding/WelcomeDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import SignOutDialog from '@/components/shared/SignOutDialog';
import ShareAppDialog from '@/components/shared/ShareAppDialog';
import { canRate, canShare, openRating } from '@/lib/storeLinks';

export default function Settings() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [textSize, setTextSizeState] = useState(savedTextSize());
  const [emailMissing, setEmailMissing] = useState(false);
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [support, setSupport] = useState(null); // 'support' | 'bug' | null
  const [signingOut, setSigningOut] = useState(false);
  const [sharing, setSharing] = useState(false);

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
    setEmailMissing(false);
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
        {/* Big text mode, first thing on the page so it's easy to find (Anna, Nov 15 2026:
            "The text is still too small for my dad"). Kept on this phone (lib/textSize). */}
        {/* The words sit under the name and switch so they keep the card's whole width when big. */}
        <div className="bg-card rounded-2xl border-2 border-primary/30 p-5 md:p-6">
          <div className="flex items-center gap-3">
            <div className="big-hide w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0"><span className="font-heading font-bold text-primary text-lg leading-none" aria-hidden="true">Aa</span></div>
            <h2 className="flex-1 min-w-0 font-heading text-lg font-semibold"><label htmlFor="big-text">Big text mode</label></h2>
            <Switch id="big-text" checked={textSize === BIG.value} onCheckedChange={(on) => { const v = on ? BIG.value : 'normal'; setTextSize(v); setTextSizeState(v); }} />
          </div>
          <p className="big-flush text-xs text-muted-foreground mt-1 pl-[3.25rem]">Makes the words and buttons much bigger on this phone.</p>
        </div>

        {/* Family, plan, notifications, phone calendar */}
        <Link to="/family-settings" className="flex items-center gap-3 bg-card rounded-2xl border border-border/50 p-5 md:p-6 hover:bg-muted/40 transition-colors">
          <div className="big-hide w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Users className="w-5 h-5 text-primary" /></div>
          <div className="flex-1">
            <h2 className="font-heading text-lg font-semibold">My Family</h2>
            <p className="text-xs text-muted-foreground">Who's in it, invites, your plan, notifications and phone calendar.</p>
          </div>
        </Link>

        {/* The owner's record keeping (admins only). */}
        {user?.role === 'admin' && (
          <Link to="/activity" className="flex items-center gap-3 bg-card rounded-2xl border border-border/50 p-5 md:p-6 hover:bg-muted/40 transition-colors">
            <div className="big-hide w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><ActivityIcon className="w-5 h-5 text-primary" /></div>
            <div className="flex-1">
              <h2 className="font-heading text-lg font-semibold">App activity</h2>
              <p className="text-xs text-muted-foreground">Only you see this: who uses GenCare where, what works and what breaks.</p>
            </div>
          </Link>
        )}
        {user?.role === 'admin' && (
          <button type="button" onClick={previewWelcome} className="w-full text-left flex items-center gap-3 bg-card rounded-2xl border border-border/50 p-5 hover:bg-muted/40 transition-colors">
            <div className="big-hide w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><MessageCircleHeart className="w-5 h-5 text-primary" /></div>
            <div className="flex-1">
              <h2 className="font-heading text-lg font-semibold">Preview the welcome chat</h2>
              <p className="text-xs text-muted-foreground">Only you see this: the chat new people get. Nothing you type in it is saved.</p>
            </div>
          </button>
        )}

        {/* Account / Email */}
        <div className="bg-card rounded-2xl border border-border/50 p-5 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="big-hide w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
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
            <Button variant="outline" onClick={() => setEmailDialogOpen(true)} className="gap-2 max-w-full h-auto min-h-10 whitespace-normal">
              <Send className="w-4 h-4" /> Request Email Change
            </Button>
          </div>
        </div>

        {/* Appearance */}
        <div className="bg-card rounded-2xl border border-border/50 p-5 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="big-hide w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              {resolvedTheme === 'dark' ? <Moon className="w-5 h-5 text-accent" /> : <Sun className="w-5 h-5 text-accent" />}
            </div>
            <div>
              <h2 className="font-heading text-lg font-semibold">Appearance</h2>
              <p className="text-xs text-muted-foreground">Choose how GenCare looks to you.</p>
            </div>
          </div>
          {/* Light, Dark, or follow the phone's own setting (testers' report, Nov 2026). */}
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Look">
            {[
              { value: 'light', label: 'Light', icon: <Sun className="w-5 h-5 text-amber-500" /> },
              { value: 'dark', label: 'Dark', icon: <Moon className="w-5 h-5 text-indigo-500" /> },
              { value: 'system', label: 'Match my phone', icon: <Smartphone className="w-5 h-5 text-primary" /> },
            ].map((t) => (
              <button key={t.value} type="button" role="radio" aria-checked={theme === t.value} onClick={() => setTheme(t.value)}
                className={`flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-xl border-2 text-center transition-all ${theme === t.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}>
                {t.icon}
                <span className="font-medium text-sm leading-tight">{t.label}</span>
              </button>
            ))}
          </div>
          {/* Text size, kept on this phone (lib/textSize). */}
          <h3 className="text-sm font-medium mt-5 mb-1">Text size</h3>
          <p className="text-xs text-muted-foreground mb-2.5">{textSize === BIG.value ? 'Big text mode is on (at the top of this page). Pick one of these to go back to a smaller size.' : 'Makes the words and buttons bigger on this phone.'}</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Text size">
            {TEXT_SIZES.map((t, i) => (
              <button key={t.value} type="button" role="radio" aria-checked={textSize === t.value}
                onClick={() => { setTextSize(t.value); setTextSizeState(t.value); }}
                className={`flex flex-col items-center justify-end gap-1 px-2 py-3 rounded-xl border-2 transition-all ${textSize === t.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}>
                <span className="font-heading font-semibold leading-none" style={{ fontSize: `${1 + i * 0.3}rem` }} aria-hidden="true">Aa</span>
                <span className="font-medium text-sm">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Help: the how-tos first (Anna, Nov 18 2026), then asking a person. */}
        <div className="bg-card rounded-2xl border border-border/50 p-5 md:p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">Help</h2>
          <Link to="/help" className="flex items-center gap-3 h-14 px-4 mb-3 rounded-xl border-2 border-primary/30 text-base font-medium hover:bg-muted">
            <CircleHelp className="w-5 h-5 text-primary" /> <span className="flex-1">How to use GenCare</span> <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => setSupport('support')} className="gap-2 h-12"><LifeBuoy className="w-4 h-4" /> Ask for help</Button>
            <Button variant="outline" onClick={() => setSupport('bug')} className="gap-2 h-12"><Bug className="w-4 h-4" /> Report a bug</Button>
          </div>
        </div>

        {/* Rate and Share (testers' report, Nov 2026). Each shows only where its
            store link works (lib/storeLinks). */}
        {(canRate() || canShare()) && (
          <div className="bg-card rounded-2xl border border-border/50 p-5 md:p-6">
            <h2 className="font-heading text-lg font-semibold">Like GenCare?</h2>
            <p className="text-xs text-muted-foreground mt-0.5 mb-4">{canShare() ? 'A rating or a share helps' : 'A rating helps'} other families find it.</p>
            <div className={`grid gap-3 ${canRate() && canShare() ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {canRate() && <Button variant="outline" onClick={openRating} className="gap-2 h-12"><Star className="w-4 h-4" /> Rate GenCare</Button>}
              {canShare() && <Button variant="outline" onClick={() => setSharing(true)} className="gap-2 h-12"><Share2 className="w-4 h-4" /> Share GenCare</Button>}
            </div>
          </div>
        )}

        {/* Links */}
        <div className="bg-card rounded-2xl border border-border/50 p-5 md:p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">Legal & Account</h2>
          <div className="space-y-2">
            <Link to="/terms" className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <FileText className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">Terms of Use</p>
                <p className="text-xs text-muted-foreground">The rules for using GenCare</p>
              </div>
            </Link>
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

        {/* Sign out lives here as well as the menus (Anna, Oct 29 2026: on a
            phone it was hard to find). */}
        <Button variant="outline" onClick={() => setSigningOut(true)} className="w-full h-12 gap-2 text-destructive border-destructive/30 hover:bg-destructive/5">
          <LogOut className="w-4 h-4" /> Sign out{user?.email ? ` of ${user.email}` : ''}
        </Button>
      </div>

      <SignOutDialog open={signingOut} onClose={() => setSigningOut(false)} />
      <ShareAppDialog open={sharing} onClose={() => setSharing(false)} />
      <SupportDialog open={!!support} kind={support || 'support'} onClose={() => setSupport(null)} />

      {/* Email Change Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={closeEmailDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Request Email Change</DialogTitle>
            <DialogDescription>Logins can't be renamed from inside the app, so this sends a request to a person. It usually takes a few days; keep signing in with your current email until you hear back.</DialogDescription>
          </DialogHeader>
          {submitted ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-primary" />
              <p className="font-medium">Request Submitted</p>
              <p className="text-sm text-muted-foreground">Your request to change to <strong>{newEmail}</strong> is on its way. You'll get an email at both addresses once it's done; keep using your current email until then.</p>
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
                  onClick={() => { if (!newEmail.includes('@')) { setEmailMissing(true); return; } handleSubmitEmailChange(); }}
                  disabled={submitting}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Request'}
                </Button>
              </div>
              <MissingNote text={emailMissing && !newEmail.includes('@') ? (newEmail.trim() ? 'That email address needs an @.' : 'Type the new email address first.') : ''} className="-mt-2" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}