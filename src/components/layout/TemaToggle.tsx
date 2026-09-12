import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTema } from '@/lib/tema'

/**
 * O projeto já tinha os tokens `.dark` no CSS e o next-themes instalado, mas
 * nunca houve provider nem botão — o modo escuro estava pago e desligado.
 */
export function TemaToggle() {
  const { theme, setTheme } = useTema()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="Alternar tema" />}
      >
        <Sun className="size-4 dark:hidden" />
        <Moon className="hidden size-4 dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="size-4" />
          Claro
          {theme === 'light' && <span className="ml-auto text-xs">•</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="size-4" />
          Escuro
          {theme === 'dark' && <span className="ml-auto text-xs">•</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor className="size-4" />
          Sistema
          {theme === 'system' && <span className="ml-auto text-xs">•</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
