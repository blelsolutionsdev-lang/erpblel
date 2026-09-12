import { KeyRound } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { mensagemErro } from '@/lib/erros'
import { supabase } from '@/lib/supabase'

const MIN_SENHA = 8

/**
 * Destino do link enviado por "Esqueci minha senha". O Supabase abre esta
 * rota já com uma sessão de recuperação ativa; aqui só trocamos a senha.
 */
export function RedefinirSenha() {
  const navigate = useNavigate()
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    // O link chega com o token no fragmento da URL; o supabase-js troca por
    // sessão sozinho, então basta esperar a sessão aparecer.
    supabase.auth.getSession().then(({ data }) => setPronto(!!data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setPronto(!!session))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    if (senha.length < MIN_SENHA) {
      setErro(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`)
      return
    }
    if (senha !== confirmacao) {
      setErro('As senhas não conferem.')
      return
    }

    setSalvando(true)
    try {
      const { data: sessao } = await supabase.auth.getSession()
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw error

      const userId = sessao.session?.user.id
      if (userId) {
        await supabase.from('profiles').update({ deve_trocar_senha: false }).eq('id', userId)
      }

      toast.success('Senha redefinida.')
      navigate('/', { replace: true })
    } catch (err) {
      setErro(mensagemErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <KeyRound className="size-6" />
          </div>
          <CardTitle className="text-xl">Redefinir senha</CardTitle>
          <CardDescription>
            {pronto
              ? 'Escolha a nova senha da sua conta.'
              : 'Abra esta página pelo link enviado no e-mail de recuperação.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nova_senha">Nova senha</Label>
              <Input
                id="nova_senha"
                type="password"
                autoComplete="new-password"
                required
                disabled={!pronto}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmar_senha">Confirme a nova senha</Label>
              <Input
                id="confirmar_senha"
                type="password"
                autoComplete="new-password"
                required
                disabled={!pronto}
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
              />
            </div>
            {erro && <p className="text-sm text-destructive">{erro}</p>}
            <Button type="submit" className="w-full" disabled={salvando || !pronto}>
              {salvando ? 'Salvando...' : 'Salvar nova senha'}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => navigate('/login')}>
              Voltar ao login
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
