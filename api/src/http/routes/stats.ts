import { Router } from 'express'
import { StatsService } from '../../services/stats-service'
import { requireAuth, requireRole } from '../middlewares/auth'

export default function statsRoutes(stats: StatsService) {
  const router = Router()

  router.get('/', requireAuth, requireRole('admin'), async (_req, res, next) => {
    try {
      res.json(await stats.summary())
    } catch (err) {
      next(err)
    }
  })

  return router
}
