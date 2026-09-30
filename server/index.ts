import { createApp } from './app'

const { app, database } = createApp()
const port = Number(process.env.PORT || 3101)
const server = app.listen(port, () => console.log(`Delivery Planner: http://127.0.0.1:${port}`))
function shutdown() { server.close(() => { database.db.close(); process.exit(0) }) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
