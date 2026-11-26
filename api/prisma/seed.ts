import { Prisma, PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Idempotente: pode rodar a cada subida. Contas entram por e-mail (upsert) e os
// chamados de exemplo só são criados se ainda não existir um com o mesmo título para o cliente.
async function account(name: string, email: string, password: string, role: Role) {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return existing
  return prisma.user.create({ data: { name, email, passwordHash: await bcrypt.hash(password, 10), role } })
}

async function sampleTicket(data: Prisma.TicketUncheckedCreateInput) {
  const existing = await prisma.ticket.findFirst({ where: { title: data.title, customerId: data.customerId } })
  if (!existing) await prisma.ticket.create({ data })
}

async function main() {
  const admin = await account('Admin', 'admin@balcao.dev', 'Admin@123', 'admin')
  const agent = await account('Ana Atendente', 'agente@balcao.dev', 'Agente@123', 'agent')
  const customer = await account('Carlos Cliente', 'cliente@balcao.dev', 'Cliente@123', 'customer')

  await sampleTicket({
    title: 'Não consigo emitir a segunda via do boleto',
    description: 'Quando clico em segunda via aparece uma tela em branco. Preciso pagar até sexta.',
    customerId: customer.id,
  })

  await sampleTicket({
    title: 'Erro ao salvar o perfil',
    description: 'Ao alterar o telefone no perfil aparece a mensagem "erro inesperado".',
    status: 'in_progress',
    category: 'technical',
    priority: 'medium',
    triageStatus: 'done',
    customerId: customer.id,
    assigneeId: agent.id,
    replies: {
      create: [{ authorId: agent.id, body: 'Oi, Carlos! Já estamos olhando o problema.' }],
    },
  })

  await sampleTicket({
    title: 'Dúvida sobre troca de senha',
    description: 'Qual o tamanho mínimo de senha que o sistema aceita?',
    status: 'resolved',
    category: 'account',
    priority: 'low',
    triageStatus: 'done',
    customerId: customer.id,
    assigneeId: agent.id,
    replies: {
      create: [
        { authorId: agent.id, body: 'A senha precisa ter pelo menos 8 caracteres.' },
        { authorId: customer.id, body: 'Obrigado!' },
      ],
    },
  })

  console.log(`seed ok: ${admin.email}, ${agent.email}, ${customer.email}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
