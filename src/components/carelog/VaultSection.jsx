import React, { useEffect, useReducer, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, LockOpen, Plus, Eye, EyeOff, Loader2, Copy, Check, MoreHorizontal, ExternalLink } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import MoreOptions, { Choices } from '@/components/shared/MoreOptions';
import { useFamily } from '@/lib/family';
import { track } from '@/lib/activity';
import { externalClick } from '@/lib/phone';
import {
  vaultSupported, getVault, createVault, unlockVault, recoverVault, changePassword, eraseVault, lockVault, isOpen, subscribe,
  listItems, saveItem, deleteItem, moveOldEntries, countOldEntries, KINDS, kindOf,
} from '@/lib/vault';

const MIN_PASSWORD = 8;

/**
 * The person's Legal & financial entries, behind the family's folder
 * password (lib/vault.js). Locked, it shows only that the folder exists;
 * open, it lists this person's entries.
 */
export default function VaultSection({ person, people = [] }) {
  const qc = useQueryClient();
  const { me } = useFamily();
  const [, rerender] = useReducer((x) => x + 1, 0);
  const [dialog, setDialog] = useState(null); // 'setup' | 'unlock' | 'change' | 'erase' | { item }
  useEffect(() => subscribe(rerender), []);

  const { data: vault, isLoading } = useQuery({ queryKey: ['vault'], queryFn: getVault });
  const open = isOpen(vault);
  const { data: oldCount = 0 } = useQuery({ queryKey: ['vaultOld'], queryFn: countOldEntries, enabled: !open });
  const { data: items = [], isFetching } = useQuery({ queryKey: ['vaultItems', vault?.id], queryFn: () => listItems(vault), enabled: open });
  // Locked again: forget the opened copies too.
  useEffect(() => { if (!open) qc.removeQueries({ queryKey: ['vaultItems'] }); }, [open, qc]);

  const first = person?.name?.split(' ')[0] || '';
  const mine = items.filter((i) => i.member_id === person?.id);
  const isMaker = vault && (vault.created_by_user_id === me?.id || vault.created_by_id === me?.id);

  const afterOpen = async (v) => {
    try {
      const moved = await moveOldEntries(v);
      if (moved) toast({ title: `Moved ${moved} older ${moved === 1 ? 'entry' : 'entries'} into the locked folder` });
    } catch (e) { /* they stay put and move next time */ }
    qc.invalidateQueries({ queryKey: ['vault'] });
    qc.invalidateQueries({ queryKey: ['vaultItems'] });
    qc.invalidateQueries({ queryKey: ['vaultOld'] });
    qc.invalidateQueries({ queryKey: ['careLog'] });
  };

  if (!person || !vaultSupported()) return null;

  return (
    <section className="rounded-2xl border border-border/50 bg-card p-4">
      <div className="flex items-center gap-2">
        {open ? <LockOpen className="w-4 h-4 text-primary" /> : <Lock className="w-4 h-4 text-muted-foreground" />}
        <h2 className="font-heading text-base font-semibold flex-1">Legal & financial</h2>
        {open && (
          <>
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-primary" onClick={() => setDialog({ item: { member_id: person.id, kind: 'insurance' } })}><Plus className="w-4 h-4" /> Add</Button>
            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => { lockVault(); track('action', 'vault:locked'); }}><Lock className="w-3.5 h-3.5" /> Lock</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button type="button" className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted" aria-label="Folder options"><MoreHorizontal className="w-4 h-4" /></button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setDialog('change')}>Change the password</DropdownMenuItem>
                {isMaker && <DropdownMenuItem className="text-destructive" onClick={() => setDialog('erase')}>Erase the folder</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground mt-2">Loading…</p>
        : !vault ? (
          <div className="mt-1.5">
            <p className="text-sm text-muted-foreground">Power of attorney, insurance, bills and account numbers, behind a password. It's scrambled on your phone before it's saved, so nobody else can read it, not even GenCare.</p>
            {oldCount > 0 && <p className="text-xs text-muted-foreground mt-1.5">{oldCount} older {oldCount === 1 ? 'entry moves' : 'entries move'} in once it's set up.</p>}
            <Button onClick={() => setDialog('setup')} className="rounded-xl gap-2 mt-3 w-full"><Lock className="w-4 h-4" /> Set a password</Button>
          </div>
        ) : !open ? (
          <div className="mt-1.5">
            <p className="text-sm text-muted-foreground">Locked. Anyone in the family with the password can open it.</p>
            <Button onClick={() => setDialog('unlock')} variant="outline" className="rounded-xl gap-2 mt-3 w-full"><LockOpen className="w-4 h-4" /> Open</Button>
          </div>
        ) : (
          <div className="mt-2">
            {isFetching && !items.length ? <p className="text-sm text-muted-foreground py-2">Opening…</p>
              : mine.length === 0 ? <p className="text-sm text-muted-foreground py-1">Nothing here for {first} yet. Add things like a power of attorney, a Medicare card number or who to call about a bill.</p>
              : (
                <ul className="divide-y divide-border/40">
                  {mine.map((it) => <ItemRow key={it.id} item={it} onOpen={() => setDialog({ item: it })} />)}
                </ul>
              )}
            <p className="text-xs text-muted-foreground mt-2">Locks itself after 10 minutes.</p>
          </div>
        )}

      <SetupDialog open={dialog === 'setup'} onOpenChange={(o) => !o && setDialog(null)} me={me} onDone={afterOpen} />
      {vault && <UnlockDialog open={dialog === 'unlock'} onOpenChange={(o) => !o && setDialog(null)} vault={vault} onDone={afterOpen} />}
      {vault && <ChangeDialog open={dialog === 'change'} onOpenChange={(o) => !o && setDialog(null)} vault={vault} onDone={() => qc.invalidateQueries({ queryKey: ['vault'] })} />}
      {vault && open && dialog?.item && (
        <ItemDialog open onOpenChange={(o) => !o && setDialog(null)} vault={vault} item={dialog.item} people={people}
          onSaved={() => { setDialog(null); qc.invalidateQueries({ queryKey: ['vaultItems'] }); }} />
      )}
      <AlertDialog open={dialog === 'erase'} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Erase the locked folder?</AlertDialogTitle>
            <AlertDialogDescription>Everything in it is deleted for the whole family, for every person, and it can't be brought back.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
              try { await eraseVault(vault); track('action', 'vault:erased'); } catch (e) { toast({ title: "Couldn't erase it", description: e?.message, variant: 'destructive' }); }
              qc.invalidateQueries({ queryKey: ['vault'] });
            }}>Erase</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function ItemRow({ item, onOpen }) {
  if (item.broken) return <li className="py-2 text-sm text-muted-foreground">An entry that won't open (saved with an older key).</li>;
  const [, label, icon] = kindOf(item.kind);
  const date = item.date ? parseISO(item.date) : null;
  const extra = [typeof item.amount === 'number' ? `$${item.amount.toFixed(2)}` : '', date && isValid(date) ? format(date, 'MMM d, yyyy') : ''].filter(Boolean).join(' · ');
  return (
    <li>
      <button type="button" onClick={onOpen} className="w-full text-left flex items-start gap-3 py-2.5">
        <span className="text-xl leading-none mt-0.5">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium">{item.title || label}</span>
          <span className="block text-xs text-muted-foreground">{label}{extra ? ` · ${extra}` : ''}</span>
          {item.details && <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-line">{item.details}</span>}
        </span>
        {item.link && <a href={item.link} target="_blank" rel="noreferrer" onClick={(e) => { e.stopPropagation(); externalClick(item.link)(e); }} className="p-1 text-primary" aria-label="Open the link"><ExternalLink className="w-4 h-4" /></a>}
      </button>
    </li>
  );
}

function PasswordInput({ value, onChange, placeholder, autoFocus, autoComplete = 'current-password' }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative mt-1">
      <Input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} autoComplete={autoComplete} className="pr-10" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
    </div>
  );
}

function NewPasswordFields({ pw, setPw, again, setAgain }) {
  const short = pw.length > 0 && pw.length < MIN_PASSWORD;
  const differs = again.length > 0 && again !== pw;
  return (
    <>
      <div><Label>Password</Label><PasswordInput value={pw} onChange={setPw} autoFocus autoComplete="new-password" placeholder={`At least ${MIN_PASSWORD} characters`} /></div>
      <div><Label>Type it again</Label><PasswordInput value={again} onChange={setAgain} autoComplete="new-password" /></div>
      {(short || differs) && <p className="text-xs text-destructive">{short ? `Use at least ${MIN_PASSWORD} characters.` : "Those don't match."}</p>}
    </>
  );
}
const goodNew = (pw, again) => pw.length >= MIN_PASSWORD && pw === again;

function SetupDialog({ open, onOpenChange, me, onDone }) {
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(null); // { vault, code }
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (open) { setPw(''); setAgain(''); setMade(null); setCopied(false); } }, [open]);

  const make = async () => {
    setBusy(true);
    try {
      const res = await createVault(pw, me);
      setMade(res); setPw(''); setAgain('');
      track('action', 'vault:set up');
    } catch (e) {
      toast({ title: "Couldn't set it up", description: e?.message || 'Try again', variant: 'destructive' });
    } finally { setBusy(false); }
  };
  const finish = () => { const v = made?.vault; onOpenChange(false); if (v) onDone(v); };
  const copy = async () => { try { await navigator.clipboard.writeText(made.code); setCopied(true); } catch (e) { /* select it by hand */ } };

  return (
    <Dialog open={open} onOpenChange={(o) => (made ? finish() : onOpenChange(o))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{made ? 'Save your recovery code' : 'Lock Legal & financial'}</DialogTitle>
          <DialogDescription className="sr-only">Set the folder password</DialogDescription>
        </DialogHeader>
        {!made ? (
          <div className="space-y-4 mt-1">
            <p className="text-sm text-muted-foreground">One password for the family's folder. Tell it to whoever should see it. It never leaves the phone, so GenCare can't read the folder or reset the password.</p>
            <NewPasswordFields pw={pw} setPw={setPw} again={again} setAgain={setAgain} />
            <Button onClick={make} disabled={!goodNew(pw, again) || busy} className="w-full rounded-xl gap-2">{busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Locking…</> : 'Set password'}</Button>
          </div>
        ) : (
          <div className="space-y-4 mt-1">
            <p className="text-sm text-muted-foreground">If everyone forgets the password, this code is the only way back in. Write it down or keep it somewhere safe. It won't be shown again.</p>
            <div className="rounded-xl bg-muted p-4 text-center font-mono text-lg tracking-wider break-all select-all">{made.code}</div>
            <Button variant="outline" onClick={copy} className="w-full rounded-xl gap-2">{copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy the code</>}</Button>
            <Button onClick={finish} className="w-full rounded-xl">I saved it</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UnlockDialog({ open, onOpenChange, vault, onDone }) {
  const [mode, setMode] = useState('password'); // 'password' | 'code'
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setMode('password'); setPw(''); setCode(''); setAgain(''); setError(''); } }, [open]);

  const go = async (e) => {
    e?.preventDefault?.();
    setBusy(true); setError('');
    try {
      if (mode === 'password') { await unlockVault(vault, pw); track('action', 'vault:opened'); }
      else { await recoverVault(vault, code, pw); track('action', 'vault:password reset with code'); toast({ title: 'New password set', description: 'Let the family know the new one.' }); }
      onOpenChange(false);
      onDone(vault);
    } catch (err) {
      if (err?.code === 'wrong') { setError(mode === 'password' ? "That's not the password." : "That code doesn't match."); track('action', mode === 'password' ? 'vault:wrong password' : 'vault:wrong code'); }
      else setError(err?.message || "Couldn't open it. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{mode === 'password' ? 'Open Legal & financial' : 'Use the recovery code'}</DialogTitle>
          <DialogDescription className="sr-only">Enter the folder password</DialogDescription>
        </DialogHeader>
        <form onSubmit={go} className="space-y-4 mt-1">
          {mode === 'password' ? (
            <div><Label>Password</Label><PasswordInput value={pw} onChange={setPw} autoFocus /></div>
          ) : (
            <>
              <div><Label>Recovery code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autoFocus autoCapitalize="characters" autoComplete="off" className="mt-1 font-mono" /></div>
              <p className="text-xs text-muted-foreground">Then pick a new password.</p>
              <NewPasswordFields pw={pw} setPw={setPw} again={again} setAgain={setAgain} />
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full rounded-xl gap-2" disabled={busy || (mode === 'password' ? !pw : !code.trim() || !goodNew(pw, again))}>
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening…</> : mode === 'password' ? 'Open' : 'Set new password'}
          </Button>
          <button type="button" onClick={() => { setMode(mode === 'password' ? 'code' : 'password'); setPw(''); setAgain(''); setError(''); }} className="w-full text-sm text-primary">
            {mode === 'password' ? 'Forgot it? Use the recovery code' : 'Back to the password'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChangeDialog({ open, onOpenChange, vault, onDone }) {
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setCurrent(''); setPw(''); setAgain(''); setError(''); } }, [open]);
  const go = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await changePassword(vault, current, pw);
      track('action', 'vault:password changed');
      toast({ title: 'Password changed', description: 'Let the family know the new one.' });
      onOpenChange(false); onDone();
    } catch (err) { setError(err?.code === 'wrong' ? "That's not the current password." : err?.message || 'Try again.'); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Change the password</DialogTitle>
          <DialogDescription className="sr-only">Change the folder password</DialogDescription>
        </DialogHeader>
        <form onSubmit={go} className="space-y-4 mt-1">
          <div><Label>Current password</Label><PasswordInput value={current} onChange={setCurrent} autoFocus /></div>
          <NewPasswordFields pw={pw} setPw={setPw} again={again} setAgain={setAgain} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full rounded-xl" disabled={busy || !current || !goodNew(pw, again)}>{busy ? 'Changing…' : 'Change it'}</Button>
          <p className="text-xs text-muted-foreground">The recovery code stays the same.</p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const PLACEHOLDER = { poa: 'e.g. Power of attorney for Mom', will: 'e.g. Will, signed 2024', insurance: 'e.g. Medicare card', benefit: 'e.g. Social Security', bank: 'e.g. Checking at Chase', bill: 'e.g. Electric bill', tax: 'e.g. 2025 tax return', time_off_work: 'e.g. FMLA paperwork', other: 'What is it?' };

function ItemDialog({ open, onOpenChange, vault, item, people, onSaved }) {
  const editing = !!item.id;
  const [form, setForm] = useState(() => ({ kind: 'insurance', title: '', details: '', amount: '', date: '', link: '', ...item, amount: item.amount ?? '' }));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const who = people.find((p) => p.id === form.member_id);
      const amount = form.amount === '' ? '' : Number(form.amount);
      await saveItem(vault, { ...form, member_name: who?.name || form.member_name || '', amount: Number.isNaN(amount) ? '' : amount }, item.id);
      track('action', editing ? 'vault:entry changed' : 'vault:entry added');
      onSaved();
    } catch (e) {
      toast({ title: "Couldn't save", description: e?.message || 'Try again', variant: 'destructive' });
    } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await deleteItem(item.id); track('action', 'vault:entry deleted'); onSaved(); }
    catch (e) { toast({ title: "Couldn't delete", description: e?.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2"><Lock className="w-4 h-4 text-primary" /> {editing ? 'Legal & financial' : 'Add to the locked folder'}</DialogTitle>
          <DialogDescription className="sr-only">Legal and financial entry</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <Choices value={form.kind} onChange={(v) => set('kind', v)} options={KINDS.map(([v, label]) => [v, label])} />
          <div><Label>What *</Label><Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder={PLACEHOLDER[form.kind] || ''} className="mt-1" autoFocus={!editing} /></div>
          <div><Label>Details</Label><Textarea value={form.details} onChange={(e) => set('details', e.target.value)} rows={3} placeholder="Policy or account numbers, who to call, where the paper copy is" className="mt-1" /></div>
          <MoreOptions defaultOpen={editing && !!(form.amount !== '' || form.date || form.link)} hint="Amount, date, link, who it's for">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount</Label>
                <div className="relative mt-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span><Input type="number" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} className="pl-7" /></div>
              </div>
              <div><Label>Date</Label><Input type="date" value={form.date || ''} onChange={(e) => set('date', e.target.value)} className="mt-1" /></div>
            </div>
            <div><Label>Link</Label><Input type="url" value={form.link || ''} onChange={(e) => set('link', e.target.value)} placeholder="https://…" className="mt-1" /></div>
            <div>
              <Label>For</Label>
              <Select value={form.member_id || ''} onValueChange={(v) => set('member_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </MoreOptions>
          {editing && (item.created_by_name || item.logged_by) && <p className="text-xs text-muted-foreground">Added by {item.logged_by || item.created_by_name}</p>}
          <div className="flex items-center gap-2 pt-1">
            {editing && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>Delete</Button>}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={!String(form.title || '').trim() || busy}>{busy ? 'Saving…' : editing ? 'Save' : 'Add'}</Button>
          </div>
        </div>
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this?</AlertDialogTitle>
              <AlertDialogDescription>It goes for everyone in the family. This can't be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={remove}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
