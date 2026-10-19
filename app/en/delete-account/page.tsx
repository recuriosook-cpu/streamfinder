import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * Cómo eliminar la cuenta, en inglés: la URL que pide Google Play para la ficha
 * en inglés y la que linkea la app en inglés (1.0.16). Es la traducción de
 * `app/eliminar-cuenta/page.tsx`, más los pasos desde la app.
 */
export const metadata: Metadata = {
  title: 'Delete your account - Glynbox',
  description: 'How to delete your Glynbox account and all your personal data.',
  alternates: {
    canonical: '/en/delete-account',
    languages: { es: '/eliminar-cuenta', en: '/en/delete-account' },
  },
}

function Paso({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="w-6 h-6 rounded-full bg-[#FFFD02] text-black text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
      <span>{children}</span>
    </li>
  )
}

export default function DeleteAccountPage() {
  return (
    <div lang="en" className="min-h-screen bg-[#0A0A0F] py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-10">

        <div>
          <Link href="/" className="text-[#FFFD02] text-sm hover:underline">← Back to Glynbox</Link>
          <h1 className="text-3xl font-bold text-white mt-4">Delete your Glynbox account</h1>
          <p className="text-[#A0A0B0] mt-2 text-sm">
            You can delete your account yourself at any time, from the app or the website.
          </p>
        </div>

        <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">From the app</h2>
          <ol className="space-y-3 text-sm text-zinc-300">
            <Paso n={1}>Open Glynbox and go to <strong className="text-white">Settings</strong>.</Paso>
            <Paso n={2}>Scroll down to <strong className="text-white">Danger zone</strong> and tap <strong className="text-white">Delete account</strong>.</Paso>
            <Paso n={3}>Tap <strong className="text-white">Continue</strong> and then <strong className="text-white">Delete permanently</strong>.</Paso>
          </ol>
        </section>

        <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">From the website</h2>
          <ol className="space-y-3 text-sm text-zinc-300">
            <Paso n={1}>Sign in at <strong className="text-white">glynbox.com</strong> with your account.</Paso>
            <Paso n={2}>Open <strong className="text-white">Ajustes</strong> (settings) with the gear icon (⚙️) in the navigation bar.</Paso>
            <Paso n={3}>Scroll down to <strong className="text-white">Zona de peligro</strong> (danger zone) at the bottom of the page.</Paso>
            <Paso n={4}>
              Click <strong className="text-white">Eliminar cuenta</strong> (delete account), type{' '}
              <code className="font-mono bg-[#1C1C27] px-1.5 py-0.5 rounded text-[#FFFD02]">ELIMINAR</code> to confirm and then click{' '}
              <strong className="text-white">Eliminar definitivamente</strong> (delete permanently).
            </Paso>
          </ol>
          <p className="text-xs text-[#A0A0B0]">The website is in Spanish; the button names are shown as they appear there.</p>
          <div className="pt-2">
            <Link
              href="/ajustes"
              className="inline-block bg-[#FFFD02] hover:bg-[#E5EB00] text-black font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Go to Settings →
            </Link>
          </div>
        </section>

        <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-semibold text-white">What data is deleted?</h2>
          <p className="text-sm text-[#A0A0B0]">Deleting your account permanently and irreversibly removes:</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm text-zinc-300">
            {[
              'Your profile and username',
              'All your reviews',
              'Your comments',
              'Your custom lists',
              'Your watched history',
              'Your watchlist',
              'Your likes',
              'Your ratings',
              'The people you follow and your followers',
              'Your profile picture',
              'Your notifications',
              'Your shared stats',
            ].map(item => (
              <li key={item} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-semibold text-white">What data is kept?</h2>
          <p className="text-sm text-zinc-300">
            <strong className="text-white">None.</strong> Glynbox deletes all your data as soon as you confirm the deletion. We don&apos;t keep any personal data once the process is complete.
          </p>
        </section>

        <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-semibold text-white">How long does it take?</h2>
          <p className="text-sm text-zinc-300">
            Deletion is <strong className="text-white">immediate</strong>. Once you confirm, your data is removed from our servers right away. There is no recovery period.
          </p>
        </section>

        <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-semibold text-white">Can&apos;t sign in?</h2>
          <p className="text-sm text-zinc-300">
            If you lost access to your account and still want it deleted, email us at{' '}
            <a href="mailto:hola@glynbox.com" className="text-[#FFFD02] hover:underline">hola@glynbox.com</a>{' '}
            from the email address linked to your account. We&apos;ll process it within 48 hours.
          </p>
        </section>

      </div>
    </div>
  )
}
