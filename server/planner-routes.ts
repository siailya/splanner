import { Router, type Request, type RequestHandler } from 'express'
import { type openDatabase } from './database'
import { createPlannerCrud } from './planner-crud'

export function plannerRoutes(database: ReturnType<typeof openDatabase>, requireEdit: RequestHandler) {
  const router = Router({ mergeParams: true })
  const crud = createPlannerCrud(database)
  const code = (req: Request) => String(req.params.code).toLowerCase()
  const epicId = (req: Request) => String(req.params.epicId)
  const stageId = (req: Request) => String(req.params.stageId)
  const handle = (action: (req: Request) => unknown, status = 200): RequestHandler => (req, res, next) => {
    try { res.status(status).json(action(req)) } catch (error) { next(error) }
  }

  router.get('/epics', handle(req => crud.listEpics(code(req))))
  router.post('/epics', requireEdit, handle(req => crud.createEpic(code(req), req.body), 201))
  router.get('/epics/:epicId', handle(req => crud.getEpic(code(req), epicId(req))))
  router.patch('/epics/:epicId', requireEdit, handle(req => crud.updateEpic(code(req), epicId(req), req.body)))
  router.delete('/epics/:epicId', requireEdit, handle(req => crud.deleteEpic(code(req), epicId(req), req.body)))
  router.get('/epics/:epicId/stages', handle(req => crud.listStages(code(req), epicId(req))))
  router.post('/epics/:epicId/stages', requireEdit, handle(req => crud.createStage(code(req), epicId(req), req.body), 201))
  router.get('/stages', handle(req => crud.listStages(code(req))))
  router.get('/stages/:stageId', handle(req => crud.getStage(code(req), stageId(req))))
  router.patch('/stages/:stageId', requireEdit, handle(req => crud.updateStage(code(req), stageId(req), req.body)))
  router.delete('/stages/:stageId', requireEdit, handle(req => crud.deleteStage(code(req), stageId(req), req.body)))
  return router
}
