import React from 'react';
import { Link } from 'react-router-dom';
import { UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Public page (no sign-in) that the Play Store and App Store link to: how to
 * delete a GenCare account and what happens to the data. The deletion itself
 * runs from Settings -> Account Management inside the app (or after signing in
 * on the web), so nobody can delete someone else's account from here.
 */
export default function DeleteAccount() {
  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3 mb-2">
        <UserX className="w-7 h-7 text-destructive" />
        Delete your GenCare account
      </h1>
      <p className="text-muted-foreground mb-6">GenCare by Mediocre at Best Dev. You can delete your account, or just your data, yourself at any time.</p>

      <div className="space-y-5 text-foreground">
        <section>
          <h2 className="font-heading text-lg font-semibold mb-2">In the app</h2>
          <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
            <li>Open GenCare and sign in.</li>
            <li>Go to <strong>Settings</strong> → <strong>Account Management</strong>.</li>
            <li>Choose <strong>Delete My Account</strong> (removes the account and all its data) or <strong>Delete My Data</strong> (keeps the account, clears everything in it).</li>
            <li>Type the confirmation word and confirm.</li>
          </ol>
          <p className="text-muted-foreground mt-2">The same page works on the web after signing in:</p>
          <Button asChild variant="outline" className="mt-2">
            <Link to="/account-management">Open Account Management</Link>
          </Button>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold mb-2">What gets deleted</h2>
          <p className="text-muted-foreground">Your profile, the family members you created, appointments, medications, care logs, checklists, journal entries, messages, notes and recordings, your push-notification registration, and your subscription record in our systems. Deletion is immediate and cannot be undone. If you were the only member of a family, the family's shared data is deleted too; if other members remain, data they created stays with them.</p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold mb-2">What is kept</h2>
          <p className="text-muted-foreground">Nothing is kept on purpose. Backups made by our hosting provider age out within 30 days. Purchases are handled by Google Play or the App Store, so your purchase history stays in your Google or Apple account, not with us.</p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold mb-2">Can't sign in?</h2>
          <p className="text-muted-foreground">Email <a className="underline" href="mailto:mediocreatbestdev@outlook.com?subject=Delete%20my%20GenCare%20account">mediocreatbestdev@outlook.com</a> from the address on the account and we will delete it for you within 7 days.</p>
        </section>

        <p className="text-sm text-muted-foreground pt-2">
          <Link to="/privacy-policy" className="underline">Privacy Policy</Link> · <Link to="/terms" className="underline">Terms of Service</Link>
        </p>
      </div>
    </div>
  );
}
