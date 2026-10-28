import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, ArrowLeft } from 'lucide-react';

const UPDATED = 'October 27, 2026';

// Plain-language terms. Edit the text here; the privacy policy lives on its own page.
export default function Terms() {
  return (
    <div className="pb-24 lg:pb-8 max-w-2xl">
      <Link to="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4"><ArrowLeft className="w-4 h-4" /> Settings</Link>
      <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3 mb-1"><FileText className="w-7 h-7 text-primary" /> Terms of Use</h1>
      <p className="text-sm text-muted-foreground mb-6">Last updated {UPDATED}</p>

      <div className="space-y-5 text-sm leading-relaxed">
        <Section title="What GenCare is">
          GenCare is a family care organizer made by Mediocre at Best Dev. It helps a family keep one calendar, task list, medication list, care logs and recorded notes in one place and share them with each other. It is not medical advice, a medical record system, or an emergency service. For an emergency, call your local emergency number.
        </Section>
        <Section title="Your account and your family">
          You need an account to use GenCare. When you join a family, everyone in that family can see what is shared with the family: the calendar, tasks, medications, care logs, messages, and recordings marked as shared. Only add people you trust, and only share information you are comfortable with them seeing. The family owner can remove members. You can leave a family at any time; what you shared stays with the family.
        </Section>
        <Section title="Recording">
          GenCare can record audio on your phone and turn it into notes. You are responsible for following the recording laws where you are. In some places everyone in a conversation has to agree to be recorded. Recordings are transcribed and summarized by an AI service, and like any AI output the notes can contain mistakes. Check anything important, especially medical instructions, against the transcript or the person who said it.
        </Section>
        <Section title="Subscriptions">
          A new family gets GenCare free for 7 days. After that, one member's subscription (through Google Play or the App Store) covers the whole family. Subscriptions renew until cancelled; cancel in your store account. Refunds follow the store's own policy. We may change prices with notice.
        </Section>
        <Section title="Your data">
          How GenCare handles your information is described in the <Link to="/privacy-policy" className="text-primary underline">Privacy Policy</Link>. You can delete your data or your account from Settings.
        </Section>
        <Section title="Acceptable use">
          Do not use GenCare to harm, harass or deceive anyone, to store information you have no right to store, or to break the law. We may suspend accounts that do.
        </Section>
        <Section title="No warranty">
          GenCare is provided as is. We work hard to keep it reliable, but we do not promise it will always be available or error-free, and we are not liable for losses that come from relying on it. Nothing here limits rights the law gives you.
        </Section>
        <Section title="Changes and contact">
          We may update these terms; the date above changes when we do. Questions go to mediocreatbestdev@outlook.com.
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="font-semibold text-base mb-1">{title}</h2>
      <p className="text-muted-foreground">{children}</p>
    </section>
  );
}
