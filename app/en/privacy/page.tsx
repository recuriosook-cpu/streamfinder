import { Metadata } from "next";

/**
 * La política de privacidad en inglés, para la app en inglés (1.0.16) y la
 * ficha en inglés de las tiendas. Es la traducción de `app/privacidad/page.tsx`:
 * cualquier cambio en una va también en la otra.
 */
export const metadata: Metadata = {
  title: "Privacy Policy — Glynbox",
  description: "How Glynbox collects, uses and protects your personal data.",
  alternates: {
    canonical: "/en/privacy",
    languages: { es: "/privacidad", en: "/en/privacy" },
  },
};

const enlace = "text-[#FFFD02] hover:text-[#FFF84D] transition-colors";

export default function PrivacyPage() {
  return (
    <div lang="en" className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold mb-2 text-white">Privacy Policy</h1>
        <p className="text-[#A0A0B0] mb-12">Last updated: October 2026</p>

        <div className="space-y-12">
          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">1. What data we collect</h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              When you use Glynbox we may collect the following personal data:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>
                <span className="text-white font-medium">Email address</span> — to create and manage your account.
              </li>
              <li>
                <span className="text-white font-medium">Name and profile picture</span> — provided by you or by your sign-in provider.
              </li>
              <li>
                <span className="text-white font-medium">Viewing history</span> — movies and shows you mark as watched, add to your watchlist or like.
              </li>
              <li>
                <span className="text-white font-medium">Reviews and ratings</span> — the content you post about movies and shows.
              </li>
              <li>
                <span className="text-white font-medium">Social interactions</span> — followers, people you follow and public activity on the platform.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">2. How we use the data</h2>
            <p className="text-zinc-300 leading-relaxed mb-3">We use the information we collect to:</p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>Personalize your movie and show recommendations based on your history.</li>
              <li>Show your social activity to the people who follow you.</li>
              <li>Keep you signed in and remember your preferences.</li>
              <li>Send you notifications about your account activity (if you turn them on).</li>
              <li>Improve how the platform works and the overall experience.</li>
            </ul>
            <p className="text-[#A0A0B0] mt-4 text-sm">
              We do not sell your personal data (name, email, history) to third parties. The ads we show are
              served through Google AdSense cookies on the website and Google AdMob in the mobile app, described
              in sections 5 and 6.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">3. Third-party data</h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Glynbox lets you sign in with external providers:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>
                <span className="text-white font-medium">Google</span> — when you sign in with Google, we receive your name, email address and public profile picture.
              </li>
              <li>
                <span className="text-white font-medium">Facebook</span> — when you sign in with Facebook, we receive your name, email address and public profile picture.
              </li>
              <li>
                <span className="text-white font-medium">Apple</span> — when you use Sign in with Apple, we receive an identifier for your Apple account, your email address (or an Apple relay address, if you choose to hide it) and your name, which Apple shares only the first time. If you delete your Glynbox account, we also revoke the access you gave Glynbox from your Apple account.
              </li>
            </ul>
            <p className="text-zinc-300 leading-relaxed mt-3">
              This data is also governed by the privacy policies of Google, Facebook and Apple, respectively. Glynbox only stores the minimum information needed to identify you on the platform.
            </p>
            <p className="text-zinc-300 leading-relaxed mt-3">
              Movie and show information comes from{" "}
              <span className="text-white font-medium">The Movie Database (TMDB)</span>. Glynbox does not collect personal data through TMDB.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">4. Cookies and local storage</h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Glynbox uses cookies and the browser&apos;s local storage to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>
                <span className="text-white font-medium">Session</span> — keep you securely signed in between visits.
              </li>
              <li>
                <span className="text-white font-medium">Country preference</span> — remember the country you chose, to show the streaming services available in your region.
              </li>
              <li>
                <span className="text-white font-medium">Interface preferences</span> — personal display settings, such as the app language.
              </li>
            </ul>
            <p className="text-zinc-300 leading-relaxed mt-3">
              You can delete cookies from your browser settings at any time, although some features of the platform may stop working as expected.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">5. Advertising and third-party cookies</h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Glynbox uses <span className="text-white font-medium">Google AdSense</span> to show ads. Google and
              its partners may use cookies to serve ads based on your previous visits to this site and other
              websites.
            </p>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Advertising cookies allow Google and its partners to show relevant ads to our users. You can turn off
              personalized advertising at any time in{" "}
              <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className={enlace}>
                Google Ad Settings
              </a>.
            </p>
            <p className="text-zinc-300 leading-relaxed mb-3">
              For more information about how Google uses data in its advertising network:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300 mb-3">
              <li>
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className={enlace}>
                  Google Privacy Policy
                </a>
              </li>
              <li>
                <a href="https://policies.google.com/technologies/cookies" target="_blank" rel="noopener noreferrer" className={enlace}>
                  How Google uses cookies
                </a>
              </li>
            </ul>
            <p className="text-[#A0A0B0] text-sm">
              Glynbox does not sell your personal data (name, email address, viewing history) to third parties.
              AdSense cookies are managed directly by Google under its own policies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">6. Advertising in the mobile app</h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              The Glynbox mobile app for Android and iPhone (iOS) shows ads. The provider is{" "}
              <span className="text-white font-medium">Google AdMob</span>, a Google service.
            </p>
            <p className="text-zinc-300 leading-relaxed mb-3">To show ads, Google may use:</p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>
                <span className="text-white font-medium">Your device&apos;s advertising ID</span> — a code that Android or iOS assigns to your phone, which you can reset or delete at any time. On iPhone it is Apple&apos;s advertising identifier (IDFA), and Google can only use it if you allow it in Apple&apos;s tracking prompt (see below).
              </li>
              <li>
                <span className="text-white font-medium">App usage data</span> — for example, which ads you were shown, whether you interacted with them, and technical device data such as the model or Android or iOS version.
              </li>
              <li>
                <span className="text-white font-medium">Approximate location</span> — derived from your IP address, to show ads relevant to your region.
              </li>
            </ul>
            <p className="text-zinc-300 leading-relaxed mt-3 mb-3">
              Glynbox does not send Google your name, email address or viewing history for advertising purposes.
              The data Google collects through AdMob is governed by its own policies:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300 mb-3">
              <li>
                <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer" className={enlace}>
                  How Google uses data for advertising
                </a>
              </li>
              <li>
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className={enlace}>
                  Google Privacy Policy
                </a>
              </li>
            </ul>

            <h3 className="text-base font-semibold text-white mt-8 mb-3">
              Tracking prompt on iPhone (App Tracking Transparency)
            </h3>
            <p className="text-zinc-300 leading-relaxed mb-3">
              On iPhone, the first time you open the app we show a screen explaining what the advertising
              identifier is used for, followed by Apple&apos;s prompt asking whether you allow Glynbox to track your
              activity across other companies&apos; apps and websites.
            </p>
            <p className="text-zinc-300 leading-relaxed mb-3">
              If you don&apos;t allow it, Google does not access your advertising identifier: you&apos;ll still see ads,
              but they won&apos;t be personalized. You can change your choice at any time in{" "}
              <span className="text-white font-medium">iPhone Settings → Privacy &amp; Security → Tracking → Glynbox</span>.
              This choice does not affect any other Glynbox features.
            </p>

            <h3 className="text-base font-semibold text-white mt-8 mb-3">
              Consent in the European Economic Area and the United Kingdom
            </h3>
            <p className="text-zinc-300 leading-relaxed mb-3">
              If you are in the European Economic Area, Switzerland or the United Kingdom, the first time you open
              the app we ask for your consent to use data for advertising purposes. You can change that choice at
              any time in <span className="text-white font-medium">Settings → Legal → Ad privacy options</span>,
              inside the app.
            </p>
            <p className="text-zinc-300 leading-relaxed mb-3">
              That option only appears for users in the European Economic Area, Switzerland and the United Kingdom.
              Changing your consent does not affect any other Glynbox features.
            </p>

            <h3 className="text-base font-semibold text-white mt-8 mb-3">How to turn off personalized ads</h3>
            <p className="text-zinc-300 leading-relaxed mb-3">
              In any country, you can ask your phone not to use your identifier to personalize ads.
            </p>
            <p className="text-white font-medium mb-2">On iPhone</p>
            <ol className="list-decimal list-inside space-y-2 text-zinc-300 mb-4">
              <li>
                Open your iPhone&apos;s <span className="text-white font-medium">Settings</span>.
              </li>
              <li>
                Go to <span className="text-white font-medium">Privacy &amp; Security → Tracking</span>.
              </li>
              <li>
                Turn off <span className="text-white font-medium">Glynbox</span>, or turn off <span className="text-white font-medium">Allow Apps to Request to Track</span> for all apps.
              </li>
            </ol>
            <p className="text-white font-medium mb-2">On Android</p>
            <ol className="list-decimal list-inside space-y-2 text-zinc-300">
              <li>
                Open your phone&apos;s <span className="text-white font-medium">Settings</span>.
              </li>
              <li>
                Go to <span className="text-white font-medium">Google → All services → Ads</span> (depending on your Android version it may appear as <span className="text-white font-medium">Privacy → Ads</span>).
              </li>
              <li>
                Choose <span className="text-white font-medium">Delete advertising ID</span> or <span className="text-white font-medium">Opt out of Ads Personalization</span>.
              </li>
            </ol>
            <p className="text-zinc-300 leading-relaxed mt-3">
              You&apos;ll still see ads in the app, but they will no longer be based on your interests. From the same
              menu you can also reset your identifier to start over.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">7. Your rights</h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              As a Glynbox user, you have the following rights over your data:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>
                <span className="text-white font-medium">Access</span> — you can see the data we have about you at any time from your profile.
              </li>
              <li>
                <span className="text-white font-medium">Correction</span> — you can update your name, profile picture and other details from your account settings.
              </li>
              <li>
                <span className="text-white font-medium">Deletion</span> — you can delete your account and all associated data from the app or the website (see{" "}
                <a href="/en/delete-account" className={enlace}>Delete your account</a>), or by contacting us.
              </li>
              <li>
                <span className="text-white font-medium">Export</span> — you can request a copy of your data (history, reviews, lists) by contacting support.
              </li>
              <li>
                <span className="text-white font-medium">Objection</span> — you can object to your data being used to personalize recommendations or social activity.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">8. Contact</h2>
            <p className="text-zinc-300 leading-relaxed">
              If you have questions about this privacy policy, want to exercise any of your rights or need support, you can contact us at:
            </p>
            <a
              href="mailto:contacto@glynbox.com"
              className="inline-block mt-3 text-[#FFFD02] hover:text-[#FFF84D] transition-colors font-medium"
            >
              contacto@glynbox.com
            </a>
            <p className="text-[#A0A0B0] text-sm mt-6">
              This is a translation of the{" "}
              <a href="/privacidad" className={enlace}>Spanish version</a>. If they differ, the Spanish version prevails.
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
