export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Hero skeleton */}
      <div className="relative w-full h-[60vh] bg-[#13131A] animate-pulse" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        {[1, 2, 3].map(i => (
          <section key={i}>
            <div className="h-6 w-48 bg-[#1C1C27] rounded mb-4 animate-pulse" />
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 6 }).map((_, j) => (
                <div key={j} className="shrink-0 w-32 sm:w-36">
                  <div className="aspect-[2/3] bg-[#1C1C27] rounded-lg animate-pulse mb-1.5" />
                  <div className="h-3 bg-[#1C1C27] rounded animate-pulse mb-1" />
                  <div className="h-2 w-1/2 bg-[#1C1C27] rounded animate-pulse" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
