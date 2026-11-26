import { PrismaClient } from '@prisma/client'
import { databaseUrl, env } from '../config/env'

export const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl() } },
  log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
})
