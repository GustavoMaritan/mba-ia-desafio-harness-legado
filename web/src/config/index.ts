// Unico lugar do front que le import.meta.env (gate G5).
// A subida grava VITE_API_URL em web/.env.local apontando para a API da propria copia.
export const API_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:4000'
