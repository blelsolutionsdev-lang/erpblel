import { type FormEvent, useState } from 'react'
import { KeyRound, LogOut, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth'
import { mensagemErro } from '@/lib/erros'
import { supabase } from '@/lib/supabase'

const MIN_SENHA = 8

/** Conta do usuário na barra superior: trocar a própria senha e sair. */
export function MenuUsuario() {
  const { profile, user, signOut } = useAuth()
  const [trocandoSenha, setTrocandoSenha] = useState(false)
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const iniciais = (profile?.nome ?? '?').slice(0, 2).toUpperCase()

  async function trocarSenha(e: FormEvent) {
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
      toast.success('Senha alterada.')
      setTrocandoSenha(false)
      setSenha('')
      setConfirmacao('')
    } catch (err) {
      setErro(mensagemErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="sm" className="gap-2" aria-label="Menu da conta" />}
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
            {iniciais}
          </span>
          <span className="hidden max-w-32 truncate sm:inline">{profile?.nome ?? '...'}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{profile?.nome ?? '—'}</span>
              <span className="text-xs text-muted-foreground">{user?.email}</span>
              <span className="text-xs text-muted-foreground capitalize">
                {profile?.role?.nome ?? 'sem papel'}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setTrocandoSenha(true)}>
            <KeyRound className="size-4" />
            Trocar minha senha
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void signOut()}>
            <LogOut className="size-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={trocandoSenha} onOpenChange={setTrocandoSenha}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRound className="size-4" />
              Trocar minha senha
            </DialogTitle>
          </DialogHeader>
          <form id="form-trocar-senha" className="space-y-4" onSubmit={trocarSenha}>
            <div className="space-y-2">
              <Label htmlFor="menu_nova_senha">Nova senha</Label>
              <Input
                id="menu_nova_senha"
                type="password"
                autoComplete="new-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="menu_confirmar_senha">Confirme a nova senha</Label>
              <Input
                id="menu_confirmar_senha"
                type="password"
                autoComplete="new-password"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
              />
            </div>
            {erro && <p className="text-sm text-destructive">{erro}</p>}
          </form>
          <DialogFooter>
            <Button type="submit" form="form-trocar-senha" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar senha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
