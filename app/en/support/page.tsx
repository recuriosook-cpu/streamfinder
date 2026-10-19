import type { Metadata } from 'next'
import FaqItem from './FaqItem'

/**
 * El centro de ayuda en inglés, para la app en inglés (1.0.16) y la ficha en
 * inglés de las tiendas (la URL de soporte que piden las dos). Es la
 * traducción de `app/soporte/page.tsx`, con las respuestas al día con la app:
 * la cuenta se borra desde Ajustes y Glynbox se usa en cualquier país.
 */
export const metadata: Metadata = {
  title: 'Help Center — Glynbox',
  description: 'Answers to frequently asked questions about Glynbox, and how to contact support.',
  alternates: {
    canonical: '/en/support',
    languages: { es: '/soporte', en: '/en/support' },
  },
}

const FAQS = [
  {
    q: 'How do I create an account?',
    a: 'Open the app and create an account with your email and a password, or continue with Google, Apple or Facebook.',
  },
  {
    q: 'How do I add a movie to my watchlist?',
    a: 'On any movie or show page, tap "Watchlist". You can also create your own lists and add titles to them from the same page.',
  },
  {
    q: 'How do I write a review?',
    a: 'Open the movie or show you want to review, scroll down to "Reviews" and tap "Write a review". You can rate it from half a star to 5 stars and add your thoughts.',
  },
  {
    q: 'How do I follow other users?',
    a: 'Open any user\'s profile by tapping their name or searching for them, then tap "Follow". You can also find people in the Community tab.',
  },
  {
    q: 'How do I get notified about actors and directors?',
    a: 'Open their page and tap "Follow". We\'ll let you know about their new releases, newly announced projects and birthdays, and when one of their titles arrives on your streaming services. You can choose which alerts you get in Settings → Notifications.',
  },
  {
    q: 'How do I change the app language?',
    a: 'Go to Settings → Account → Language. "Automatic" follows your phone\'s language; you can also choose Español or English.',
  },
  {
    q: 'How do I report a bug?',
    a: 'Email us at soporte@glynbox.com with a description of the problem, the device you use and the steps to reproduce it.',
  },
  {
    q: 'How do I delete my account?',
    a: 'In the app, go to Settings → Danger zone → Delete account. All your data is deleted right away. If you can\'t sign in, see the "Delete your account" page or email us.',
  },
  {
    q: 'Is Glynbox free?',
    a: 'Yes. Glynbox is completely free: you can sign up, create lists, write reviews and join the community at no cost. The app shows ads.',
  },
  {
    q: 'Which countries is Glynbox available in?',
    a: 'Glynbox works in any country. Streaming availability depends on your country, and we show the services available where you are. You can change your country in Settings.',
  },
]

export default function SupportPage() {
  return (
    <div lang="en" className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="max-w-2xl mx-auto px-4 pt-16 pb-20">

        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">Help Center</h1>
          <p className="text-[#A0A0B0]">Find answers to the most common questions.</p>
        </div>

        <section className="space-y-3 mb-14">
          <h2 className="text-lg font-bold mb-5">Frequently asked questions</h2>
          {FAQS.map(faq => (
            <FaqItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </section>

        <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(255,253,2,0.12)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFD02" strokeWidth="2" aria-hidden="true">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2">Didn&apos;t find what you were looking for?</h2>
          <p className="text-sm text-[#A0A0B0] mb-6 max-w-sm mx-auto">
            Email us at{' '}
            <a href="mailto:soporte@glynbox.com" className="text-[#FFFD02] hover:underline">
              soporte@glynbox.com
            </a>{' '}
            and we&apos;ll get back to you within 48 hours. You can write in English or Spanish.
          </p>
          <a
            href="mailto:soporte@glynbox.com?subject=Support request — Glynbox"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-black transition-all hover:opacity-90"
            style={{ backgroundColor: '#FFFD02' }}
          >
            Email support
          </a>
        </section>

        <section className="mt-10">
          <p className="text-center text-sm text-[#A0A0B0] mb-5">You can also reach us on social media:</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {[
              { label: 'TikTok', handle: '@glynboxapp', href: 'https://www.tiktok.com/@glynboxapp' },
              { label: 'Instagram', handle: '@glynbox.app', href: 'https://www.instagram.com/glynbox.app' },
              { label: 'X (Twitter)', handle: '@glynboxapp', href: 'https://x.com/glynboxapp' },
            ].map(s => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Glynbox on ${s.label}`}
                className="flex items-center justify-center gap-2.5 bg-[#13131A] border border-[#2A2A3A] hover:border-[#FFFD02]/40 rounded-xl px-5 py-3 text-sm text-[#A0A0B0] hover:text-[#FFFD02] transition-all"
              >
                <span className="font-medium">{s.label}</span>
                <span className="text-xs opacity-60">{s.handle}</span>
              </a>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
