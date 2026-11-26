import { env } from './config/env'
import { createApp } from './http/app'
import { attachmentRepository } from './repositories/attachment-repository'
import { healthRepository } from './repositories/health-repository'
import { replyRepository } from './repositories/reply-repository'
import { statsRepository } from './repositories/stats-repository'
import { ticketRepository } from './repositories/ticket-repository'
import { userRepository } from './repositories/user-repository'
import { AttachmentService } from './services/attachment-service'
import { AuthService } from './services/auth-service'
import { HealthService } from './services/health-service'
import { StatsService } from './services/stats-service'
import { SuggestionService } from './services/suggestion-service'
import { TicketService } from './services/ticket-service'

// Composição: só aqui as rotas recebem serviços ligados aos repositórios do Prisma.
const tickets = new TicketService(ticketRepository, replyRepository)

const app = createApp({
  health: new HealthService(healthRepository),
  auth: new AuthService(userRepository),
  tickets,
  attachments: new AttachmentService(attachmentRepository, tickets),
  suggestions: new SuggestionService(tickets, userRepository),
  stats: new StatsService(statsRepository),
})

app.listen(env.port, () => {
  console.log(`API rodando em ${env.publicUrl}`)
})
