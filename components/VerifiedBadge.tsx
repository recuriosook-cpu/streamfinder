export const VERIFIED_USERS = ['Ferlageok']

export function isVerified(username: string | null | undefined): boolean {
  return !!username && VERIFIED_USERS.includes(username)
}

export default function VerifiedBadge({ size = 16 }: { size?: number }) {
  return (
    <span title="Cuenta verificada" className="inline-flex shrink-0 cursor-default">
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10" cy="10" r="10" fill="#1D9BF0"/>
        <path d="M5.5 10.25L8.5 13.25L14.5 7.25" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  )
}
