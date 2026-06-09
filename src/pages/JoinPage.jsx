import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';

export default function JoinPage() {
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const navigate = useNavigate();

  // Auto-fill code from URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('code');
    if (urlCode) {
      setCode(urlCode.toUpperCase());
      lookupCode(urlCode.toUpperCase());
    }
  }, []);

  const lookupCode = async (c) => {
    setChecking(true);
    setError('');
    setInvite(null);
    const results = await base44.entities.Invite.filter({ code: c.toUpperCase(), is_active: true });
    if (!results || results.length === 0) {
      setError('Code not found or has expired. Please check and try again.');
    } else {
      const found = results[0];
      const now = new Date();
      if (found.expires_at && new Date(found.expires_at) < now) {
        setError('This invite code has expired. Please ask for a new one.');
      } else {
        setInvite(found);
      }
    }
    setChecking(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (code.trim()) lookupCode(code.trim());
  };

  const handleJoin = async () => {
    // Increment use count
    await base44.entities.Invite.update(invite.id, { uses_count: (invite.uses_count || 0) + 1 });
    setConfirmed(true);
    // Redirect to register with code pre-filled in URL
    setTimeout(() => {
      navigate(`/register?invite=${invite.code}`);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
            <Heart className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="font-heading text-3xl font-bold text-foreground">GenCare</h1>
          <p className="text-muted-foreground text-sm text-center">Family Care Hub</p>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          {confirmed ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <p className="text-center font-medium">Joining {invite?.family_name}...</p>
              <p className="text-sm text-muted-foreground text-center">Taking you to create your account.</p>
            </div>
          ) : invite ? (
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">You've been invited to join</p>
                <p className="text-xl font-bold text-foreground">{invite.family_name}</p>
                {invite.created_by_name && (
                  <p className="text-sm text-muted-foreground mt-1">by {invite.created_by_name}</p>
                )}
              </div>
              <Button onClick={handleJoin} className="w-full gap-2">
                Join Family <ArrowRight className="w-4 h-4" />
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                You'll create a free account to get started.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-1">Join a Family</h2>
                <p className="text-sm text-muted-foreground">Enter the invite code you received.</p>
              </div>
              <Input
                placeholder="e.g. ABC123"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                className="text-center text-xl font-mono tracking-widest uppercase"
                maxLength={8}
              />
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
              <Button type="submit" disabled={checking || !code.trim()} className="w-full">
                {checking ? 'Checking...' : 'Continue'}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Already have an account? <Link to="/login" className="text-primary underline">Sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}