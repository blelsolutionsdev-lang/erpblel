import { Factory } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth'
import { mensagemErro } from '@/lib/erros'
import { supabase } from '@/lib/supabase'

export function Login() {
  const { user, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [recuperando, setRecuperando] = useState(false)

  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) setError(error)
  }

  // Antes, esquecer a senha significava pedir para um admin resetar.
  async function handleRecuperar() {
    if (!email.trim()) {
      setError('Informe seu e-mail para receber o link de redefinição.')
      return
    }
    setError(null)
    setRecuperando(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      })
      if (error) throw error
      toast.success('Se esse e-mail estiver cadastrado, o link de redefinição chega em instantes.')
    } catch (err) {
      setError(mensagemErro(err))
    } finally {
      setRecuperando(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Factory className="size-6" />
          </div>
          <CardTitle className="text-xl">ThermoTech ERP</CardTitle>
          <CardDescription>Entre com suas credenciais para acessar o sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Entrando...' : 'Entrar'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleRecuperar}
              disabled={recuperando}
            >
              {recuperando ? 'Enviando...' : 'Esqueci minha senha'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
