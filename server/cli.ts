import { readFileSync } from 'node:fs'
import { createWorkspaceExport, parseWorkspaceExport } from '../app/infrastructure/files/workspace-transfer'
import { openDatabase } from './database'

async function readPin(): Promise<string> {
  process.stdout.write('PIN (4 цифры): ')
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
    process.stdout.write('\n')
    return Buffer.concat(chunks).toString('utf8').trim()
  }
  return new Promise((resolve, reject) => {
    let value = ''
    process.stdin.setRawMode(true)
    process.stdin.resume()
    const onData = (chunk: Buffer) => {
      const char = chunk.toString('utf8')
      if (char === '\u0003') { cleanup(); reject(new Error('Ввод прерван')); return }
      if (char === '\r' || char === '\n') { cleanup(); process.stdout.write('\n'); resolve(value); return }
      if (char === '\u007f') value = value.slice(0, -1)
      else if (/^\d$/.test(char) && value.length < 4) value += char
    }
    const cleanup = () => { process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause() }
    process.stdin.on('data', onData)
  })
}

const args = process.argv.slice(2)
const command = args[0]
const option = (flag: string) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1] }
const database = openDatabase()
try {
  if (command === 'workspace:create') {
    const name = option('--name')
    if (!name) throw new Error('Укажите --name')
    const imported = option('--import') ? parseWorkspaceExport(readFileSync(option('--import')!, 'utf8')).workspace : undefined
    const pin = await readPin()
    const created = database.createWorkspace(name, pin, imported)
    console.log(`Создан workspace ${created.name}\nКод: ${created.code}\nСсылка: ${(process.env.PUBLIC_ORIGIN || 'http://localhost:3101')}/w/${created.code}/view/timeline`)
  } else if (command === 'workspace:list') {
    console.table(database.listWorkspaces())
  } else if (command === 'workspace:reset-pin') {
    const code = option('--code')
    if (!code) throw new Error('Укажите --code')
    database.resetPin(code, await readPin())
    console.log(`PIN workspace ${code} изменён; старые сессии завершены`)
  } else if (command === 'backup:database') {
    const destination = option('--output')
    if (!destination) throw new Error('Укажите --output')
    await database.db.backup(destination)
    console.log(`Копия SQLite записана: ${destination}`)
  } else if (command === 'workspace:export') {
    const code = option('--code')
    if (!code) throw new Error('Укажите --code')
    console.log(JSON.stringify(createWorkspaceExport(database.load(code))))
  } else {
    console.log('Команды: workspace:create --name NAME [--import FILE], workspace:list, workspace:reset-pin --code CODE, backup:database --output FILE, workspace:export --code CODE')
    process.exitCode = 1
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  database.db.close()
}
