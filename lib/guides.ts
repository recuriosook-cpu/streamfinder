import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const GUIDES_DIR = path.join(process.cwd(), 'content', 'guides')

export interface GuideMovie {
  tmdbId: number
  mediaType: 'movie' | 'tv'
}

export interface GuideFrontmatter {
  title:       string
  slug:        string
  description: string
  heroImage?:  string
  heroColor?:  string     // fallback gradient if no image
  publishedAt: string
  updatedAt:   string
  author:      string
  category:    string
  tags:        string[]
  movies:      GuideMovie[]
}

export interface GuideData extends GuideFrontmatter {
  content: string
}

function parseFile(file: string): GuideData {
  const raw = fs.readFileSync(path.join(GUIDES_DIR, file), 'utf-8')
  const { data, content } = matter(raw)
  return { ...(data as GuideFrontmatter), content }
}

export function getAllGuides(): GuideFrontmatter[] {
  if (!fs.existsSync(GUIDES_DIR)) return []
  return fs
    .readdirSync(GUIDES_DIR)
    .filter(f => f.endsWith('.mdx'))
    .map(f => {
      const raw = fs.readFileSync(path.join(GUIDES_DIR, f), 'utf-8')
      const { data } = matter(raw)
      return data as GuideFrontmatter
    })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
}

export function getGuideBySlug(slug: string): GuideData | null {
  if (!fs.existsSync(GUIDES_DIR)) return null
  const files = fs.readdirSync(GUIDES_DIR).filter(f => f.endsWith('.mdx'))
  for (const file of files) {
    const guide = parseFile(file)
    if (guide.slug === slug) return guide
  }
  return null
}

export function getAllGuideSlugs(): string[] {
  if (!fs.existsSync(GUIDES_DIR)) return []
  return fs
    .readdirSync(GUIDES_DIR)
    .filter(f => f.endsWith('.mdx'))
    .map(f => {
      const raw = fs.readFileSync(path.join(GUIDES_DIR, f), 'utf-8')
      const { data } = matter(raw)
      return (data as GuideFrontmatter).slug
    })
}
