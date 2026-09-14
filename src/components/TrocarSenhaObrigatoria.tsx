import { type FormEvent, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth'
import { mensagemErro } from '@/lib/erros'
import { supabase } from '@/lib/supabase'

const MIN_SENHA = 8

/**
 * A senha provisória gerada pelo admin não pode virar a senha definitiva:
 * enquanto `profiles.deve_trocar_senha` estiver marcado, esta tela substitui o
 * app inteiro.
 */
export function TrocarSenhaObrigatoria() {
  const { user, signOut, refreshProfile } = useAuth()
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

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
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw error

      const { error: flagErr } = await supabase
        .from('profiles')
        .update({ deve_trocar_senha: false })
        .eq('id', user!.id)
      if (flagErr) throw flagErr

      toast.success('Senha alterada. Bem-vindo!')
      await refreshProfile()
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
          <CardTitle className="text-xl">Defina sua senha</CardTitle>
          <CardDescription>
            Você entrou com uma senha provisória. Escolha uma senha própria para continuar.
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
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
              />
            </div>
            {erro && <p className="text-sm text-destructive">{erro}</p>}
            <Button type="submit" className="w-full" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar senha'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => void signOut()}
            >
              Sair
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
