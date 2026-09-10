import { Construction } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'

export function EmConstrucao({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center text-muted-foreground">
        <Construction className="size-8" />
        <p className="font-medium text-foreground">Em construção</p>
        {description && <p className="max-w-md text-sm">{description}</p>}
      </div>
    </div>
  )
}
