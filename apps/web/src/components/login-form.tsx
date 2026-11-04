import { useState, type FormEvent } from 'react'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LoginForm() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Connexion" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email" className="text-[15px] font-semibold">
          E-mail
        </Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="username"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password" className="text-[15px] font-semibold">
          Mot de passe
        </Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {/* Seul bouton principal jaune de l'app : la connexion fait le lien entre le site et l'outil. */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-brand-yellow text-brand-ink focus-visible:ring-ring/50 focus-visible:border-ring mt-1 inline-flex h-[54px] items-center justify-center rounded-full border-2 border-transparent px-6 text-[17px] font-extrabold outline-none focus-visible:ring-3 disabled:opacity-60 motion-safe:transition-transform motion-safe:hover:-translate-y-0.5"
      >
        {isSubmitting ? 'Connexion…' : 'Prendre mon poste'}
      </button>
    </form>
  )
}
