interface Props {
  message?: string
  onRetry?: () => void
}

export default function ErrorState({
  message = 'No pudimos cargar este contenido',
  onRetry,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <span className="text-4xl select-none">😕</span>
      <p className="text-[#A0A0B0] text-sm max-w-xs">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm font-semibold text-black bg-[#FFFD02] hover:bg-[#E5EB00] px-5 py-2 rounded-full transition-colors"
        >
          Reintentar
        </button>
      )}
    </div>
  )
}
