import { Eraser } from 'lucide-react'
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export type SignaturePadHandle = {
  isEmpty: () => boolean
  toBlob: () => Promise<Blob | null>
  clear: () => void
}

export const SignaturePad = forwardRef<SignaturePadHandle>(function SignaturePad(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasStroke = useRef(false)
  const [, forceRender] = useState(0)

  function getContext() {
    return canvasRef.current?.getContext('2d') ?? null
  }

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getContext()
    if (!ctx) return
    drawing.current = true
    const { x, y } = pointerPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    canvasRef.current?.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = getContext()
    if (!ctx) return
    const { x, y } = pointerPos(e)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#111'
    ctx.lineTo(x, y)
    ctx.stroke()
    hasStroke.current = true
  }

  function handlePointerUp() {
    drawing.current = false
    forceRender((n) => n + 1)
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = getContext()
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasStroke.current = false
    forceRender((n) => n + 1)
  }

  useImperativeHandle(ref, () => ({
    isEmpty: () => !hasStroke.current,
    clear,
    toBlob: () =>
      new Promise((resolve) => {
        canvasRef.current?.toBlob((blob) => resolve(blob), 'image/png')
      }),
  }))

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border bg-white">
        <canvas
          ref={canvasRef}
          width={460}
          height={160}
          className="w-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>
      <Button type="button" variant="outline" size="sm" onClick={clear}>
        <Eraser className="size-3.5" />
        Limpar assinatura
      </Button>
    </div>
  )
})
