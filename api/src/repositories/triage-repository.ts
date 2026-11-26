import { Ticket, TicketCategory, TicketPriority } from '../domain/ticket'
import { prisma } from './prisma'

// Consultas do worker de triagem.
export const triageRepository = {
  findPending(limit: number): Promise<Ticket[]> {
    return prisma.ticket.findMany({
      where: { triageStatus: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    })
  },

  async markDone(id: string, result: { category: TicketCategory; priority: TicketPriority }) {
    await prisma.ticket.update({
      where: { id },
      data: { category: result.category, priority: result.priority, triageStatus: 'done' },
    })
  },

  async markFailed(id: string) {
    await prisma.ticket.update({ where: { id }, data: { triageStatus: 'failed' } })
  },
}
