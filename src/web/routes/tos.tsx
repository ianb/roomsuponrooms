import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root.js";

export const tosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tos",
  component: TermsOfServicePage,
});

function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8 text-sm text-content/70">
      <h1 className="text-2xl font-bold text-content">Terms of Service</h1>

      <p>
        These terms and conditions (the &ldquo;Terms and Conditions&rdquo;) govern the use of
        roomsuponrooms.com (the &ldquo;Site&rdquo;). This Site is owned and operated by Ian Bicking.
        This Site is an AI-powered text adventure game platform.
      </p>
      <p>
        By using this Site, you indicate that you have read and understand these Terms and
        Conditions and agree to abide by them at all times.
      </p>

      <Section title="Intellectual Property">
        <p>
          All content published and made available on our Site is the property of Ian Bicking and
          the Site&rsquo;s creators. This includes, but is not limited to images, text, logos,
          documents, downloadable files and anything that contributes to the composition of our
          Site.
        </p>
        <p>
          Content made in the process of using the game on the Site is the property of the user who
          created it. The user grants the Site a license to use the content for any future purposes.
        </p>
      </Section>

      <Section title="Age Restrictions">
        <p>
          The minimum age to use our Site is 13 years old. By using this Site, users agree that they
          are over 13 years old. We do not assume any legal responsibility for false statements
          about age.
        </p>
      </Section>

      <Section title="Acceptable Use">
        <p>
          As a user of our Site, you agree to use our Site legally, not to use our Site for illegal
          purposes, and not to:
        </p>
        <ul className="ml-6 list-disc space-y-1">
          <li>Harass or mistreat other users of our Site;</li>
          <li>Violate the rights of other users of our Site;</li>
          <li>
            Violate the intellectual property rights of the Site owners or any third party to the
            Site;
          </li>
          <li>Hack into the account of another user of the Site;</li>
          <li>Act in any way that could be considered fraudulent; or</li>
          <li>Post any material that may be deemed inappropriate or offensive.</li>
        </ul>
        <p>
          If we believe you are using our Site illegally or in a manner that violates these Terms
          and Conditions, we reserve the right to limit, suspend or terminate your access to our
          Site. We also reserve the right to take any legal steps necessary to prevent you from
          accessing our Site.
        </p>
      </Section>

      <Section title="Accounts">
        <p>When you create an account on our Site, you agree to the following:</p>
        <ol className="ml-6 list-decimal space-y-1">
          <li>
            You are solely responsible for your account and the security and privacy of your
            account, including passwords or sensitive information attached to that account; and
          </li>
          <li>
            All personal information you provide to us through your account is up to date, accurate,
            and truthful and that you will update your personal information if it changes.
          </li>
        </ol>
        <p>
          We reserve the right to suspend or terminate your account if you are using our Site
          illegally or if you violate these Terms and Conditions.
        </p>
      </Section>

      <Section title="Limitation of Liability">
        <p>
          Ian Bicking and our directors, officers, agents, employees, subsidiaries, and affiliates
          will not be liable for any actions, claims, losses, damages, liabilities and expenses
          including legal fees from your use of the Site.
        </p>
      </Section>

      <Section title="Indemnity">
        <p>
          Except where prohibited by law, by using this Site you indemnify and hold harmless Ian
          Bicking and our directors, officers, agents, employees, subsidiaries, and affiliates from
          any actions, claims, losses, damages, liabilities and expenses including legal fees
          arising out of your use of our Site or your violation of these Terms and Conditions.
        </p>
      </Section>

      <Section title="Applicable Law">
        <p>These Terms and Conditions are governed by the laws of Minnesota, USA.</p>
      </Section>

      <Section title="Severability">
        <p>
          If at any time any of the provisions set forth in these Terms and Conditions are found to
          be inconsistent or invalid under applicable laws, those provisions will be deemed void and
          will be removed from these Terms and Conditions. All other provisions will not be affected
          by the removal and the rest of these Terms and Conditions will still be considered valid.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          These Terms and Conditions may be amended from time to time in order to maintain
          compliance with the law and to reflect any changes to the way we operate our Site and the
          way we expect users to behave on our Site.
        </p>
      </Section>

      <Section title="Contact Details">
        <p>
          Please contact us if you have any questions or concerns. Our contact details are as
          follows:
        </p>
        <p>
          <a href="mailto:ian@ianbicking.org" className="text-accent hover:text-accent-hover">
            ian@ianbicking.org
          </a>
        </p>
      </Section>

      <p className="text-content/40">Effective Date: March 28, 2026</p>
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
