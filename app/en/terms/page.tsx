import { Metadata } from "next";

/**
 * Los términos y condiciones en inglés, para la app en inglés (1.0.16) y la
 * ficha en inglés de las tiendas. Es la traducción de `app/terminos/page.tsx`:
 * cualquier cambio en una va también en la otra.
 */
export const metadata: Metadata = {
  title: "Terms and Conditions — Glynbox",
  description: "Read the terms and conditions for using Glynbox.",
  alternates: {
    canonical: "/en/terms",
    languages: { es: "/terminos", en: "/en/terms" },
  },
};

export default function TermsPage() {
  return (
    <div lang="en" className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold mb-2 text-white">Terms and Conditions</h1>
        <p className="text-[#A0A0B0] mb-12">Last updated: October 2026</p>

        <div className="space-y-12">
          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">1. The service</h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Glynbox is a website and mobile app that lets users discover movies and shows, see which streaming services carry them in their country, keep track of what they&apos;ve watched, write reviews and follow other users&apos; activity.
            </p>
            <p className="text-zinc-300 leading-relaxed">
              Movie and show information is provided by{" "}
              <span className="text-white font-medium">The Movie Database (TMDB)</span>. Glynbox is not responsible for the accuracy or availability of that information, and does not guarantee that a title is available on any particular streaming service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">2. Acceptable use</h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              By using Glynbox you agree to use the service responsibly and respectfully. The following is expressly prohibited:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>Posting offensive, discriminatory, violent or illegal content.</li>
              <li>Spam, unauthorized advertising or unsolicited mass communications.</li>
              <li>Impersonating other people or organizations.</li>
              <li>Attempting to gain unauthorized access to other users&apos; accounts or to Glynbox systems.</li>
              <li>Using automated tools (bots, scrapers) to extract data from the platform.</li>
              <li>Posting fake, manipulated or coordinated reviews for malicious purposes.</li>
            </ul>
            <p className="text-zinc-300 leading-relaxed mt-3">
              Glynbox reserves the right to suspend or delete accounts that break these rules, without prior notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">3. Intellectual property</h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Information about movies and shows, posters and other metadata shown on Glynbox comes from{" "}
              <span className="text-white font-medium">The Movie Database (TMDB)</span> and is subject to its own terms of use and intellectual property rights.
            </p>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Glynbox&apos;s own source code, design and visual elements belong to its creators and may not be reproduced or distributed without express permission.
            </p>
            <p className="text-zinc-300 leading-relaxed">
              The <span className="text-white font-medium">reviews and ratings</span> you post on Glynbox are your own. By posting them, you grant Glynbox a non-exclusive license to display them on the platform. You can delete your reviews at any time from your profile.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">4. Limitation of liability</h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Glynbox is provided &quot;as is&quot;, without warranties of any kind, express or implied. In particular:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>We do not guarantee uninterrupted availability of the service.</li>
              <li>We are not responsible for the accuracy of streaming availability information, which can change without notice.</li>
              <li>We are not liable for data loss caused by technical failures, although we take reasonable measures to prevent it.</li>
              <li>We are not responsible for content posted by users (reviews, comments), although we actively moderate content that breaks these rules.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">5. Changes to the service</h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Glynbox reserves the right to modify, suspend or discontinue any part of the service at any time, with or without notice.
            </p>
            <p className="text-zinc-300 leading-relaxed mb-3">
              These terms and conditions may be updated from time to time. When we make significant changes, we will update the date on this page. Continuing to use the service after changes are published means you accept the new terms.
            </p>
            <p className="text-zinc-300 leading-relaxed">
              We recommend checking this page occasionally to stay informed about the current terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">6. Contact</h2>
            <p className="text-zinc-300 leading-relaxed">
              If you have questions about these terms and conditions or about using Glynbox, you can contact us at:
            </p>
            <a
              href="mailto:contacto@glynbox.com"
              className="inline-block mt-3 text-[#FFFD02] hover:text-[#FFF84D] transition-colors font-medium"
            >
              contacto@glynbox.com
            </a>
            <p className="text-[#A0A0B0] text-sm mt-6">
              This is a translation of the{" "}
              <a href="/terminos" className="text-[#FFFD02] hover:text-[#FFF84D] transition-colors">Spanish version</a>. If they differ, the Spanish version prevails.
            </p>
          </section>
        </div>
      </div>

      <footer className="border-t border-[#2A2A3A] mt-16">
        <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[#A0A0B0] text-sm">
          <span>© {new Date().getFullYear()} Glynbox. All rights reserved.</span>
          <div className="flex gap-6">
            <a href="/en/privacy" className="hover:text-zinc-300 transition-colors">Privacy</a>
            <a href="/en/terms" className="hover:text-zinc-300 transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
