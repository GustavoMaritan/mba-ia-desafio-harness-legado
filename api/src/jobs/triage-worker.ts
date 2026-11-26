import { env } from '../config/env'
import { classifyTicket } from '../integrations/ai-client'
import { triageRepository } from '../repositories/triage-repository'

const interval = env.triageIntervalMs

async function runOnce() {
  const tickets = await triageRepository.findPending(10)

  for (const ticket of tickets) {
    try {
      const result = await classifyTicket(ticket)
      await triageRepository.markDone(ticket.id, result)
      console.log(`chamado ${ticket.id} triado: ${result.category}/${result.priority}`)
    } catch (err) {
      console.log(`falha na triagem do chamado ${ticket.id}: ${err instanceof Error ? err.message : String(err)}`)
      await triageRepository.markFailed(ticket.id)
    }
  }
}

async function loop() {
  try {
    await runOnce()
  } catch (err) {
    console.log('erro no worker', err)
  }
  setTimeout(loop, interval)
}

console.log(`worker de triagem rodando a cada ${interval}ms`)
loop()
