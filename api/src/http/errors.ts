import { NextFunction, Request, Response } from 'express'
import { AppError } from '../domain/errors'

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>

export function asyncHandler(fn: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'not_found', message: 'Rota não encontrada' })
}

function campo(err: unknown, nome: string): unknown {
  return typeof err === 'object' && err !== null ? (err as Record<string, unknown>)[nome] : undefined
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.code, message: err.message })
  }
  if (campo(err, 'name') === 'MulterError') {
    return res.status(422).json({ error: 'validation_error', message: campo(err, 'message') })
  }
  if (campo(err, 'type') === 'entity.parse.failed') {
    return res.status(400).json({ error: 'bad_request', message: 'JSON inválido' })
  }
  console.log('erro inesperado', err)
  res.status(500).json({ error: 'internal_error', message: 'Erro interno' })
}
