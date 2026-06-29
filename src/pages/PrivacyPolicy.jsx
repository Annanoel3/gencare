import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PrivacyPolicy() {
  return (
    <div className="pb-24 lg:pb-8 max-w-3xl">
      <div className="mb-8">
        <Link to="/settings" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Settings
        </Link>
        <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
          <Shield className="w-7 h-7 text-primary" />
          Privacy Policy
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Last updated: June 2026</p>
      </div>

      <div className="prose prose-sm max-w-none space-y-6 text-foreground">
        <section>
          <h2 className="font-heading text-lg font-semibold mb-2">1. Introduction</h2>
          <p className="text-muted-foreground">GenCare ("we", "us", "our") is a family care management application that helps you organize health information, appointments, medications, and care tasks for your loved ones. This Privacy Policy explains how we collect, use, and protect your data when you use our service.</p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold mb-2">2. Information We Collect</h2>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li><strong>Account Information:</strong> Your name, email address, and authentication credentials.</li>
            <li><strong>Family Care Data:</strong> Profiles, medical conditions, allergies, medications, appointments, care tasks, journal entries, and notes you create.</li>
            <li><strong>Integration Data:</strong> If you connect Google Calendar, we access your calendar events to display them in the app.</li>
            <li><strong>Usage Data:</strong> How you interact with the app, device information, and crash reports.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold mb-2">3. How We Use Your Data</h2>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>To provide and maintain the GenCare service.</li>
            <li>To send you care reminders and notifications about tasks and appointments.</li>
            <li>To allow family members you invite to collaborate on shared care information.</li>
            <li>To improve our features and user experience.</li>
            <li>To comply with legal obligations.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold mb-2">4. Data Sharing</h2>
          <p className="text-muted-foreground">We do not sell your data. Your family care information is only visible to you and family members you explicitly invite. We share data with third-party providers only as necessary to provide the service (e.g., Google Calendar API, push notification services) and only with your consent.</p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold mb-2">5. Data Security</h2>
          <p className="text-muted-foreground">We use industry-standard encryption and security measures to protect your data. Access is restricted to authorized personnel and is limited to what is necessary to operate the service.</p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold mb-2">6. Your Rights</h2>
          <p className="text-muted-foreground">You have the right to access, correct, or delete your personal data. You can delete all your data or your entire account at any time from the <Link to="/account-management" className="text-primary underline">Account Management</Link> page. You may also request an email change from the Settings page.</p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold mb-2">7. Data Retention</h2>
          <p className="text-muted-foreground">We retain your data for as long as your account is active. When you delete your data or account, we remove all associated information from our systems within 30 days.</p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold mb-2">8. Children's Privacy</h2>
          <p className="text-muted-foreground">GenCare is designed for adult caregivers managing care for family members. We do not knowingly collect data directly from children. Information about family members (including minors) is provided and managed by the adult account holder.</p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold mb-2">9. Changes to This Policy</h2>
          <p className="text-muted-foreground">We may update this Privacy Policy from time to time. We will notify you of significant changes through the app or via email.</p>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold mb-2">10. Contact</h2>
          <p className="text-muted-foreground">If you have questions about this Privacy Policy or your data, please contact Base44 support.</p>
        </section>
      </div>

      <div className="mt-8">
        <Link to="/settings">
          <Button variant="outline" className="gap-2"><ArrowLeft className="w-4 h-4" /> Back to Settings</Button>
        </Link>
      </div>
    </div>
  );
}