// TEMPORARILY DISABLED — all guide routes return 404 until movie IDs are manually verified.
// See fix: temporarily disable guides until movie IDs are fixed
import { notFound } from 'next/navigation'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function generateStaticParams() { return [] }

export default async function GuideSlugPage(
  _: { params: Promise<{ slug: string }> }
) {
  notFound()
}
