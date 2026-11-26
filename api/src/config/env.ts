import { z } from 'zod'

// Unico lugar da API que le process.env (gate G5).
// Os padroes sao os mesmos que o codigo antigo usava espalhado.
const schema = z.object({
  DATABASE_URL: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('4000'),
  JWT_SECRET: z.string().default('dev-secret'),
  AI_MODE: z.string().default('fake'),
  OPENAI_API_KEY: z.string().optional(),
  UPLOAD_DIR: z.string().default('/tmp/balcao/uploads'),
  TRIAGE_INTERVAL_MS: z.string().default('2000'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
})

const parsed = schema.parse(process.env)

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT || '4000',
  jwtSecret: parsed.JWT_SECRET || 'dev-secret',
  aiMode: parsed.AI_MODE,
  openaiApiKey: parsed.OPENAI_API_KEY,
  uploadDir: parsed.UPLOAD_DIR || '/tmp/balcao/uploads',
  triageIntervalMs: Number(parsed.TRIAGE_INTERVAL_MS || 2000),
  corsOrigin: parsed.CORS_ORIGIN,
  publicUrl: `http://localhost:${parsed.PORT || '4000'}`,
}

// So quem fala com o banco precisa da URL; os testes unitarios rodam sem ela.
export function databaseUrl(): string {
  return z.string().min(1).parse(parsed.DATABASE_URL)
}
