import { CountRow, StatsRepository } from '../repositories/stats-repository'

function toCounts(rows: CountRow[], initial: Record<string, number>) {
  const result = { ...initial }
  rows.forEach((row) => {
    result[row.key || 'untriaged'] = row.count
  })
  return result
}

export class StatsService {
  constructor(private stats: StatsRepository) {}

  async summary() {
    const [statusRows, categoryRows, priorityRows] = await Promise.all([
      this.stats.countByStatus(),
      this.stats.countByCategory(),
      this.stats.countByPriority(),
    ])
    return {
      byStatus: toCounts(statusRows, { open: 0, in_progress: 0, resolved: 0 }),
      byCategory: toCounts(categoryRows, { billing: 0, technical: 0, account: 0, other: 0, untriaged: 0 }),
      byPriority: toCounts(priorityRows, { low: 0, medium: 0, high: 0, urgent: 0, untriaged: 0 }),
    }
  }
}
