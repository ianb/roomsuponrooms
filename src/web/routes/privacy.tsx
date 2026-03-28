import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root.js";

export const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8 text-sm text-content/70">
      <h1 className="text-2xl font-bold text-content">Privacy Policy</h1>
      <p className="text-content/40">Effective date: March 28, 2026</p>

      <p>
        roomsuponrooms.com (the &ldquo;Site&rdquo;) is owned and operated by Ian Bicking. Ian
        Bicking can be contacted at:{" "}
        <a href="mailto:ian@ianbicking.org" className="text-accent hover:text-accent-hover">
          ian@ianbicking.org
        </a>
      </p>

      <Section title="Purpose">
        <p>
          The purpose of this privacy policy (this &ldquo;Privacy Policy&rdquo;) is to inform users
          of our Site of the following:
        </p>
        <ol className="ml-6 list-decimal space-y-1">
          <li>The personal data we will collect;</li>
          <li>Use of collected data;</li>
          <li>Who has access to the data collected;</li>
          <li>The rights of Site users; and</li>
          <li>The Site&rsquo;s cookie policy.</li>
        </ol>
        <p>This Privacy Policy applies in addition to the terms and conditions of our Site.</p>
      </Section>

      <Section title="Consent">
        <p>By using our Site users agree that they consent to:</p>
        <ol className="ml-6 list-decimal space-y-1">
          <li>The conditions set out in this Privacy Policy; and</li>
          <li>The collection, use, and retention of the data listed in this Privacy Policy.</li>
        </ol>
      </Section>

      <Section title="Personal Data We Collect">
        <p>
          We only collect data that helps us achieve the purpose set out in this Privacy Policy. We
          will not collect any additional data beyond the data listed below without notifying you
          first.
        </p>
        <h3 className="font-bold text-content/80">Data Collected Automatically</h3>
        <p>
          When you visit and use our Site, we may automatically collect and store the following
          information:
        </p>
        <ol className="ml-6 list-decimal space-y-1">
          <li>IP address;</li>
          <li>Hardware and software details;</li>
          <li>Clicked links; and</li>
          <li>Content viewed.</li>
        </ol>
      </Section>

      <Section title="How We Use Personal Data">
        <p>
          Data collected on our Site will only be used for the purposes specified in this Privacy
          Policy or indicated on the relevant pages of our Site. We will not use your data beyond
          what we disclose in this Privacy Policy.
        </p>
        <p>The data we collect automatically is used for the following purposes:</p>
        <ol className="ml-6 list-decimal space-y-1">
          <li>Website analytics to improve the service for users.</li>
        </ol>
      </Section>

      <Section title="Who We Share Personal Data With">
        <p>
          We may disclose user data to any member of our organization who reasonably needs access to
          user data to achieve the purposes set out in this Privacy Policy.
        </p>
        <p>
          We will not sell or share your data with other third parties, except in the following
          cases:
        </p>
        <ol className="ml-6 list-decimal space-y-1">
          <li>If the law requires it;</li>
          <li>If it is required for any legal proceeding;</li>
          <li>To prove or protect our legal rights; and</li>
          <li>
            To buyers or potential buyers of this company in the event that we seek to sell the
            company.
          </li>
        </ol>
        <p>
          If you follow hyperlinks from our Site to another Site, please note that we are not
          responsible for and have no control over their privacy policies and practices.
        </p>
      </Section>

      <Section title="How Long We Store Personal Data">
        <p>
          User data will be stored until the purpose the data was collected for has been achieved.
          You will be notified if your data is kept for longer than this period.
        </p>
      </Section>

      <Section title="How We Protect Your Personal Data">
        <p>
          Only minimal data is collected to secure the user&rsquo;s account (such as authentication
          information). Data is stored securely and served over encrypted connections.
        </p>
        <p>
          While we take all reasonable precautions to ensure that user data is secure and that users
          are protected, there always remains the risk of harm. The Internet as a whole can be
          insecure at times and therefore we are unable to guarantee the security of user data
          beyond what is reasonably practical.
        </p>
      </Section>

      <Section title="Children">
        <p>
          The minimum age to use our website is 13 years of age. We do not knowingly collect or use
          personal data from children under 13 years of age. If we learn that we have collected
          personal data from a child under 13 years of age, the personal data will be deleted as
          soon as possible. If a child under 13 years of age has provided us with personal data
          their parent or guardian may contact our privacy officer.
        </p>
      </Section>

      <Section title="How to Access, Modify, Delete, or Challenge the Data Collected">
        <p>
          If you would like to know if we have collected your personal data, how we have used your
          personal data, if we have disclosed your personal data and to who we disclosed your
          personal data, or if you would like your data to be deleted or modified in any way, please
          contact us:
        </p>
        <p>
          <a href="mailto:ian@ianbicking.org" className="text-accent hover:text-accent-hover">
            ian@ianbicking.org
          </a>
        </p>
      </Section>

      <Section title="Cookie Policy">
        <p>
          A cookie is a small file, stored on a user&rsquo;s hard drive by a website. Its purpose is
          to collect data relating to the user&rsquo;s browsing habits. You can choose to be
          notified each time a cookie is transmitted. You can also choose to disable cookies
          entirely in your internet browser, but this may decrease the quality of your user
          experience.
        </p>
        <p>We use the following types of cookies on our Site:</p>
        <ol className="ml-6 list-decimal space-y-1">
          <li>
            <strong className="text-content/80">Functional cookies</strong> &mdash; used to remember
            the selections you make on our Site so that your selections are saved for your next
            visits.
          </li>
        </ol>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-content">{title}</h2>
      {children}
    </section>
  );
}
