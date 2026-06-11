import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, BookOpen, Mail } from 'lucide-react';

const LAST_UPDATED = '20 May 2026';
const CONTACT_EMAIL = 'support@projectmate.com.ng';

// ─── Styled primitives (replaces @tailwindcss/typography `prose`) ────────────
const H2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-xl md:text-2xl font-bold text-slate-900 mt-10 mb-4">{children}</h2>
);
const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-slate-600 leading-relaxed mb-4">{children}</p>
);
const UL: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ul className="list-disc pl-6 space-y-2 mb-4 text-slate-600 leading-relaxed marker:text-slate-300">{children}</ul>
);
const A: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a href={href} className="text-[#1a4731] font-bold underline decoration-[#facc15]/40 underline-offset-2 hover:text-[#153a28]">
    {children}
  </a>
);
const Strong: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <strong className="text-slate-900 font-bold">{children}</strong>
);

const LegalLayout: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, children }) => {
  const navigate = useNavigate();
  return (
    <div className="bg-[#fdfdfb] min-h-screen font-['Inter']">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-24">
        <button
          onClick={() => navigate('/')}
          className="flex items-center text-slate-500 hover:text-[#1a4731] font-bold text-sm mb-10 transition-all hover:-translate-x-1"
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to home
        </button>

        <div className="flex items-center space-x-3 mb-8">
          <div className="bg-green-600 p-2 rounded-lg">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-black tracking-tighter text-[#1a4731]">ProjectMate</span>
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-[#1a4731] mb-3 font-['Playfair_Display'] leading-tight">
          {title}
        </h1>
        {subtitle && <p className="text-slate-500 mb-6 leading-relaxed">{subtitle}</p>}
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-12">
          Effective {LAST_UPDATED} · Last updated {LAST_UPDATED}
        </p>

        <article>
          {children}
        </article>

        <div className="mt-16 pt-10 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="flex items-center space-x-2 text-[#1a4731] hover:text-[#153a28] font-bold text-sm transition-colors"
          >
            <Mail className="h-4 w-4" />
            <span>{CONTACT_EMAIL}</span>
          </a>
          <div className="flex flex-wrap gap-4 text-xs font-bold uppercase tracking-widest text-slate-400">
            <button onClick={() => navigate('/legal/terms')} className="hover:text-[#1a4731] transition-colors">Terms</button>
            <button onClick={() => navigate('/legal/privacy')} className="hover:text-[#1a4731] transition-colors">Privacy</button>
            <button onClick={() => navigate('/legal/refund')} className="hover:text-[#1a4731] transition-colors">Refunds</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Terms of Service ───────────────────────────────────────────────────────
export const TermsOfService: React.FC = () => (
  <LegalLayout
    title="Terms of Service"
    subtitle="The rules of using ProjectMate. By creating an account or using the Service, you agree to these terms."
  >
    <H2>1. Eligibility</H2>
    <P>
      You must be at least 16 years old and a current student, graduate, or staff member of a Nigerian tertiary institution to use ProjectMate. By using the Service, you confirm that you meet these requirements and that the information you provide is accurate.
    </P>

    <H2>2. Your account</H2>
    <P>
      You are responsible for safeguarding your sign-in credentials and for all activity under your account. If you suspect unauthorised access, notify us immediately at <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>.
    </P>

    <H2>3. What ProjectMate does — and does NOT do</H2>
    <P>
      ProjectMate uses artificial intelligence to generate <Strong>draft</Strong> academic content modelled on the Nigerian university format. The output is a starting point — not a finished, verified, or guaranteed-correct submission. You are solely responsible for:
    </P>
    <UL>
      <li>reviewing every paragraph for factual accuracy and relevance;</li>
      <li>verifying every citation against the original source — AI sometimes fabricates ("hallucinates") references;</li>
      <li>editing the writing into your own voice and meeting your supervisor's specific requirements;</li>
      <li>complying with your institution's policies on AI assistance and plagiarism;</li>
      <li>defending the work as your own during your project defence.</li>
    </UL>
    <P>
      We do <Strong>not</Strong> guarantee that AI-generated content is original, factually accurate, free of bias, or acceptable to your supervisor or institution. ProjectMate is a writing aid, not a substitute for original scholarship.
    </P>

    <H2>4. Acceptable use</H2>
    <P>You agree not to:</P>
    <UL>
      <li>submit ProjectMate output as finished work without substantive review and editing;</li>
      <li>resell, redistribute, or sublicense your account, credits, or generated content;</li>
      <li>use the Service for any purpose other than legitimate academic work;</li>
      <li>attempt to break, probe, or interfere with the Service's security — including bypassing rate limits, credit checks, or our payment flow;</li>
      <li>generate content that is unlawful, infringes third-party rights, or violates your institution's code of conduct.</li>
    </UL>
    <P>We may suspend or terminate accounts that violate these rules. No refund will be issued for forfeited credits.</P>

    <H2>5. Credits and payments</H2>
    <P>
      AI topic suggestions are free. Each <Strong>project unlock costs 1 credit</Strong>. Once a credit is consumed to unlock a project, you may edit, regenerate chapters, run the AI copilot, and export to Word or PDF for that project without further charge. Each new project requires a new credit. Credits are non-transferable and have no cash value. All pricing is shown in Nigerian Naira (NGN) and processed through Paystack. See our <A href="#/legal/refund">Refund Policy</A> for refund eligibility.
    </P>

    <H2>6. Your content; our rights</H2>
    <P>
      You retain ownership of the topic, prompts, and edited final document you produce using the Service. You grant us a limited, worldwide licence to store, process, and display your content within your account so that we can provide the Service. We retain all rights to the ProjectMate software, brand, design, and underlying systems.
    </P>

    <H2>7. Third-party services</H2>
    <P>
      ProjectMate relies on third-party services to function, including Google Firebase (authentication and data storage), Google Gemini (AI generation), and Paystack (payments). Your use of ProjectMate is also subject to those providers' terms of service.
    </P>

    <H2>8. Limitation of liability</H2>
    <P>
      To the maximum extent permitted by Nigerian law, the Service is provided "as is" and "as available", without warranties of any kind. ProjectMate is <Strong>not liable</Strong> for academic consequences — including failed grades, project rejection, allegations of plagiarism, disciplinary action, or expulsion — arising from your use of, or reliance on, content generated by the Service. Our total aggregate liability for any claim shall not exceed the total amount you paid to us in the 30 days preceding the claim.
    </P>

    <H2>9. Changes to these Terms</H2>
    <P>
      We may update these Terms occasionally. We will revise the "Last updated" date at the top of this page. Material changes will be communicated by email. Continued use after a change constitutes acceptance.
    </P>

    <H2>10. Termination</H2>
    <P>
      You may close your account at any time by emailing <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>. We may suspend or terminate access for violations of these Terms or applicable law.
    </P>

    <H2>11. Governing law</H2>
    <P>
      These Terms are governed by the laws of the Federal Republic of Nigeria. Any dispute arising from your use of ProjectMate will be resolved exclusively by the competent courts of Lagos State.
    </P>

    <H2>12. Contact</H2>
    <P>
      Questions about these Terms: <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>.
    </P>
  </LegalLayout>
);

// ─── Privacy Policy ─────────────────────────────────────────────────────────
export const PrivacyPolicy: React.FC = () => (
  <LegalLayout
    title="Privacy Policy"
    subtitle="What we collect, how we use it, and your rights under the Nigeria Data Protection Act 2023 (NDPA)."
  >
    <H2>1. Information we collect</H2>
    <UL>
      <li><Strong>Account information:</Strong> email address, display name. Your password is handled by Firebase Authentication — we never see it in plain text.</li>
      <li><Strong>Academic profile:</Strong> student name, matriculation number, supervisor name, institution, faculty, department, project topic.</li>
      <li><Strong>Project content:</Strong> outlines, chapter drafts, and your edits.</li>
      <li><Strong>Payment metadata:</Strong> transaction reference, amount, date — provided by Paystack. We do <Strong>not</Strong> receive or store your card number, expiry, or CVV.</li>
      <li><Strong>Technical data:</Strong> sign-in timestamps, error logs, and request timing for rate-limit enforcement.</li>
    </UL>

    <H2>2. How we use your information</H2>
    <UL>
      <li>To provide the Service: store your projects, generate AI content, process payments, and grant credits.</li>
      <li>To improve the Service: aggregate diagnostics, debug failures, prevent abuse.</li>
      <li>To communicate with you: account confirmations, payment receipts, important service notices.</li>
    </UL>
    <P>We do <Strong>not</Strong> sell your personal information to third parties.</P>

    <H2>3. Third-party processors</H2>
    <P>Your information is processed by the following service providers:</P>
    <UL>
      <li><Strong>Google Firebase</Strong> (Cloud Firestore, Firebase Authentication, Cloud Functions) — stores your account and project data on Google Cloud infrastructure. Data may be located on servers outside Nigeria.</li>
      <li><Strong>Google Gemini</Strong> — receives your project topic, chapter title, department, and existing content (when using the AI copilot) to generate academic text. Under Google's commercial terms, ProjectMate user content is not used to train Gemini's underlying models.</li>
      <li><Strong>Paystack</Strong> — handles all payment-card data. Paystack is PCI-DSS compliant.</li>
    </UL>
    <P>Each provider has its own privacy policy that also applies to your data while in their custody.</P>

    <H2>4. AI and your content</H2>
    <P>
      Text you type into ProjectMate (topic, prompts, existing chapter content sent to the copilot) is transmitted to Google Gemini for processing. <Strong>Do not paste sensitive personal data unrelated to your project</Strong> — such as medical records, banking details, government IDs, or third-party private information — into the editor.
    </P>

    <H2>5. Data retention</H2>
    <P>
      We retain your account and projects for as long as your account is active. If you close your account, we will delete your projects and personal data within 30 days, except where retention is required by law, dispute resolution, or fraud prevention.
    </P>

    <H2>6. Your rights under the NDPA</H2>
    <P>Under the Nigeria Data Protection Act 2023, you have the right to:</P>
    <UL>
      <li>access the personal data we hold about you;</li>
      <li>correct inaccurate or incomplete information;</li>
      <li>request deletion of your data ("right to be forgotten");</li>
      <li>withdraw consent for non-essential processing;</li>
      <li>lodge a complaint with the Nigeria Data Protection Commission (NDPC).</li>
    </UL>
    <P>
      To exercise any of these rights, email <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A> from the address associated with your account. We will respond within 30 days.
    </P>

    <H2>7. Security</H2>
    <P>
      We protect your data with HTTPS for all traffic, server-side authentication on paid features, Firestore security rules to enforce per-user access control, distributed rate limiting to prevent abuse, and HTML sanitisation (DOMPurify) to neutralise script-injection attempts in editor content. No system is perfectly secure; you remain responsible for choosing a strong password and not sharing your sign-in credentials.
    </P>

    <H2>8. International transfers</H2>
    <P>
      Because we use Google Cloud and Paystack infrastructure, your data may be stored and processed outside Nigeria. By using the Service, you consent to these transfers and acknowledge that destination countries may have different data-protection standards than Nigeria.
    </P>

    <H2>9. Children</H2>
    <P>
      ProjectMate is intended for users aged 16 and older. We do not knowingly collect data from anyone under that age. If you believe a child has provided us personal data, contact us and we will delete it.
    </P>

    <H2>10. Cookies and local storage</H2>
    <P>We use:</P>
    <UL>
      <li>a Firebase session token in browser local storage to keep you signed in;</li>
      <li>IndexedDB cache (Firestore offline persistence) so you can keep editing when briefly offline;</li>
      <li>a small set of cookies set by Paystack during checkout, governed by their privacy policy.</li>
    </UL>
    <P>We do <Strong>not</Strong> use third-party advertising or behavioural-analytics cookies.</P>

    <H2>11. Changes to this Policy</H2>
    <P>
      Any changes will be reflected by updating the "Last updated" date at the top of this page. Material changes will be notified by email.
    </P>

    <H2>12. Contact</H2>
    <P>
      Privacy questions and data-rights requests: <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>.
    </P>
  </LegalLayout>
);

// ─── Refund Policy ──────────────────────────────────────────────────────────
export const RefundPolicy: React.FC = () => (
  <LegalLayout
    title="Refund Policy"
    subtitle="When ProjectMate will issue a refund for purchased credits — and when we can't."
  >
    <H2>1. How credits work</H2>
    <UL>
      <li>AI topic suggestions and the project outline preview are <Strong>free</Strong>. No credit is consumed.</li>
      <li>Starting (unlocking) a project for writing costs <Strong>1 credit</Strong>.</li>
      <li>After unlock, you can edit, regenerate chapters, run the AI copilot, and export the project as many times as you want — at no additional charge.</li>
      <li>A new project always requires another credit.</li>
    </UL>
    <P>Credits do not expire, remain attached to your account, and cannot be transferred or sold.</P>

    <H2>2. When you ARE eligible for a refund</H2>
    <P><Strong>(a) Duplicate or accidental payment.</Strong> If you were charged twice for the same purchase, or paid without intending to, contact us within <Strong>7 days</Strong> of the transaction. We will refund the duplicate transaction in full.</P>
    <P><Strong>(b) Payment confirmed but credit not received.</Strong> If Paystack confirmed your payment but credits did not appear on your account within 1 hour, contact us. We will reconcile the payment and either credit your account or issue a full refund.</P>
    <P><Strong>(c) Extended service outage.</Strong> If ProjectMate is unreachable for more than 24 consecutive hours due to a fault on our side, and you have an unused credit, we will refund that credit on request.</P>
    <P><Strong>(d) Wrong amount charged.</Strong> If, due to a bug on our side, you were charged an amount that does not match a whole multiple of the current credit price, we will refund the discrepancy.</P>

    <H2>3. When refunds are NOT available</H2>
    <P><Strong>(a) Used credits.</Strong> Once a credit is consumed to unlock a project, the credit cannot be refunded. The cost of AI generation has already been incurred and you have permanent edit / export access to that project.</P>
    <P><Strong>(b) Dissatisfaction with AI output quality.</Strong> ProjectMate generates draft content that requires your review and editing — quality varies with the topic and your prompt. This is inherent to AI assistance, not a defect. Use the Regenerate, Section, and Copilot tools to iterate on the output instead.</P>
    <P><Strong>(c) Change of mind after unlock.</Strong> Once you've unlocked a project, the unlock fee is non-refundable.</P>
    <P><Strong>(d) Dormant credits.</Strong> If you bought credits more than 7 days ago and haven't used them, the original transaction is non-refundable. Your credits remain on your account indefinitely.</P>
    <P><Strong>(e) Account suspension for Terms violation.</Strong> Credits forfeited under our <A href="#/legal/terms">Terms of Service</A> are not refundable.</P>

    <H2>4. How to request a refund</H2>
    <P>
      Email <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A> from the address tied to your ProjectMate account, and include:
    </P>
    <UL>
      <li>the Paystack reference number (on your payment receipt; format starts with <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-xs font-mono">pm_</code>);</li>
      <li>a one-sentence description of why you're requesting a refund;</li>
      <li>the date of the transaction.</li>
    </UL>

    <H2>5. Processing time</H2>
    <P>
      Approved refunds are returned to your original payment method (card or bank account) through Paystack within <Strong>5–7 business days</Strong>. The exact arrival time depends on your card issuer or bank.
    </P>

    <H2>6. Currency and fees</H2>
    <P>
      All refunds are issued in Nigerian Naira (NGN), in the same amount you originally paid. We do <Strong>not</Strong> deduct processing fees from refunds we initiate.
    </P>

    <H2>7. Chargebacks</H2>
    <P>
      Please contact us before initiating a chargeback with your bank. Most refund disputes can be resolved within 48 hours by email. Unjustified chargebacks may result in suspension of your account.
    </P>

    <H2>8. Contact</H2>
    <P>
      Refund requests and payment disputes: <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>.
    </P>
  </LegalLayout>
);
