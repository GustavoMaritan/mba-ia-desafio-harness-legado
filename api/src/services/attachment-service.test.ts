import { describe, expect, it } from 'vitest'
import { AttachmentService, UploadedFile } from './attachment-service'
import { TicketService } from './ticket-service'
import { AppError } from '../domain/errors'
import { Attachment, CurrentUser } from '../domain/ticket'
import { AttachmentRepository } from '../repositories/attachment-repository'

function fakeTicketService(ticket: { id: string; customerId: string }) {
  return {
    getById: async (user: CurrentUser, id: string) => {
      if (id !== ticket.id || (user.role === 'customer' && user.id !== ticket.customerId)) {
        throw new AppError(404, 'not_found', 'Chamado não encontrado')
      }
      return ticket
    },
  } as unknown as TicketService
}

const fakeAttachments: AttachmentRepository = {
  create: async (data): Promise<Attachment> => ({ id: 'att1', createdAt: new Date(), ...data }),
  findById: async () => null,
}

const ticket = { id: 't1', customerId: 'c1' }
const owner: CurrentUser = { id: 'c1', role: 'customer' }

function file(size: number, mimetype: string, originalname: string): UploadedFile {
  return { size, mimetype, originalname, buffer: Buffer.from('') }
}

describe('AttachmentService', () => {
  const service = new AttachmentService(fakeAttachments, fakeTicketService(ticket), '/tmp/balcao-teste-unitario')

  it('exige arquivo', async () => {
    await expect(service.upload(owner, 't1', undefined)).rejects.toMatchObject({ status: 422 })
  })

  it('recusa arquivo maior que 5 MB', async () => {
    await expect(service.upload(owner, 't1', file(5 * 1024 * 1024 + 1, 'text/plain', 'a.txt'))).rejects.toMatchObject({
      status: 413,
      code: 'file_too_large',
    })
  })

  it('recusa tipo não suportado', async () => {
    await expect(service.upload(owner, 't1', file(10, 'image/gif', 'a.gif'))).rejects.toMatchObject({
      status: 415,
      code: 'unsupported_type',
    })
  })

  it('não deixa outro cliente enviar', async () => {
    await expect(service.upload({ id: 'c2', role: 'customer' }, 't1', undefined)).rejects.toMatchObject({ status: 404 })
  })
})
