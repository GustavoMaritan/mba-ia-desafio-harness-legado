// Erro de regra de negocio que ja carrega o status e o codigo da resposta.
// Fica no dominio para os servicos nao dependerem de api/src/http (gate G6).
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}
