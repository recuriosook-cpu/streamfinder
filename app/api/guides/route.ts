import { NextResponse } from 'next/server'
import { getAllGuides } from '@/lib/guides'

export const dynamic = 'force-static'

export async function GET() {
  try {
    const guides = getAllGuides()
    return NextResponse.json({ guides })
  } catch {
    return NextResponse.json({ guides: [] })
  }
}
