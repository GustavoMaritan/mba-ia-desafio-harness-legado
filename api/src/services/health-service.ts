import { HealthRepository } from '../repositories/health-repository'

export class HealthService {
  constructor(private health: HealthRepository) {}

  checkDatabase() {
    return this.health.ping()
  }
}
