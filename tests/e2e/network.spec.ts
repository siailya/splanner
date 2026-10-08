import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const codes = JSON.parse(readFileSync('output/playwright/workspaces.json', 'utf8')) as { one: { code: string }, two: { code: string }, three: { code: string }, workflow: { code: string }, blocked: { code: string } }
const view = (code = codes.one.code) => `/w/${code}/view/timeline`
const edit = (code = codes.one.code) => `/w/${code}/edit/timeline`

test('viewer can follow a link and cannot write through UI or API', async ({ browser }) => {
  const viewer = await browser.newContext()
  const page = await viewer.newPage()
  await page.goto(view())
  await expect(page.getByRole('heading', { name: 'План поставки' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Редактировать' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Загрузить демо' })).toHaveCount(0)
  const loaded = await (await viewer.request.get(`/api/workspaces/${codes.one.code}`)).json()
  const blocked = await viewer.request.put(`/api/workspaces/${codes.one.code}`, { data: { expectedRevision: loaded.data.workspace.revision, data: loaded.data } })
  expect(blocked.status()).toBe(403)
  await page.goto(`/w/${codes.one.code}/view/settings/data`)
  await expect(page.getByText('Workspace на сервере')).toBeVisible()
  await viewer.close()
})

test('PIN editing, another viewer, and stale concurrent writes', async ({ browser }) => {
  const editor = await browser.newContext()
  const second = await browser.newContext()
  const editorPage = await editor.newPage()
  const viewerPage = await second.newPage()
  await editorPage.goto(edit())
  await editorPage.getByLabel('PIN').fill('0042')
  await editorPage.getByRole('button', { name: 'Открыть редактирование' }).click()
  await expect(editorPage.getByRole('button', { name: 'Завершить редактирование' })).toBeVisible()
  await viewerPage.goto(view())
  if (await editorPage.getByRole('button', { name: 'Загрузить демо' }).count()) await editorPage.getByRole('button', { name: 'Загрузить демо' }).click()
  await expect(editorPage.getByRole('row', { name: /CPM–CPA аукцион/ }).first()).toBeVisible()
  await viewerPage.reload()
  await expect(viewerPage.getByRole('row', { name: /CPM–CPA аукцион/ }).first()).toBeVisible()
  await editorPage.getByRole('button', { name: 'Поделиться' }).click()
  await expect(editorPage.getByRole('textbox', { name: 'Ссылка на просмотр' })).toHaveValue(new RegExp(`/w/${codes.one.code}/view/`))
  await second.request.post(`/api/workspaces/${codes.one.code}/edit-session`, { data: { pin: '0042' } })
  const state = await (await editor.request.get(`/api/workspaces/${codes.one.code}`)).json()
  const oldRevision = state.data.workspace.revision
  const changed = { ...state.data, workspace: { ...state.data.workspace, name: 'Another editor' } }
  const first = await editor.request.put(`/api/workspaces/${codes.one.code}`, { data: { expectedRevision: oldRevision, data: changed } })
  const stale = await second.request.put(`/api/workspaces/${codes.one.code}`, { data: { expectedRevision: oldRevision, data: changed } })
  expect(first.status()).toBe(200)
  expect(stale.status()).toBe(409)
  await editor.close(); await second.close()
})

test('workspaces and PIN sessions are isolated', async ({ browser }) => {
  const editor = await browser.newContext()
  const page = await editor.newPage()
  await page.goto(edit(codes.two.code))
  await page.getByLabel('PIN').fill('1234')
  await page.getByRole('button', { name: 'Открыть редактирование' }).click()
  await expect(page.getByRole('button', { name: 'Завершить редактирование' })).toBeVisible()
  await page.goto(view(codes.one.code))
  const alpha = await (await editor.request.get(`/api/workspaces/${codes.one.code}`)).json()
  await expect(page.getByText(alpha.data.workspace.name)).toBeVisible()
  const crossWrite = await editor.request.put(`/api/workspaces/${codes.one.code}`, { data: { expectedRevision: alpha.data.workspace.revision, data: alpha.data } })
  expect(crossWrite.status()).toBe(403)
  await editor.close()
})


test('shared titles render as text in the Gantt HTML templates', async ({ page }) => {
  await page.goto(view(codes.three.code))
  await expect(page.getByRole('row', { name: /img src=x onerror/ })).toBeVisible()
  expect(await page.locator('.gantt_grid img').count()).toBe(0)
  expect(await page.evaluate(() => (window as typeof window & { __xss?: number }).__xss)).toBeUndefined()
})


test('editor keeps baseline, table, print, backup and JSON import', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Extended editing flow is covered in Chromium; access modes run in every engine')
  const code = codes.workflow.code
  await page.goto(edit(code))
  await page.getByLabel('PIN').fill('2468')
  await page.getByRole('button', { name: 'Открыть редактирование' }).click()
  await page.getByRole('button', { name: 'Загрузить демо' }).click()
  await expect(page.getByRole('row', { name: /CPM–CPA аукцион/ })).toBeVisible()
  await page.getByRole('button', { name: 'Создать baseline' }).click()
  await page.getByLabel('Название').fill('E2E baseline')
  await page.getByRole('button', { name: 'Создать snapshot' }).click()
  await expect(page.getByLabel('Baseline для сравнения')).toHaveValue(/baseline-/)
  await page.getByRole('link', { name: 'Таблица' }).click()
  const stageRow = page.getByRole('link', { name: 'CPM: разработка стратегии', exact: true }).locator('xpath=ancestor::tr')
  await expect(stageRow).toBeVisible()
  await stageRow.getByLabel('Статус').selectOption('in_progress')
  await page.goto(`/w/${code}/edit/print`)
  await expect(page.getByRole('heading', { name: 'CPM–CPA аукцион' })).toBeVisible()
  await page.goto(`/w/${code}/edit/settings/data`)
  await page.getByPlaceholder('Название snapshot').fill('E2E backup')
  await page.getByRole('button', { name: 'Создать backup' }).click()
  await expect(page.getByText('E2E backup')).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспортировать всё' }).click()
  const file = await (await downloadPromise).path()
  expect(file).toBeTruthy()
  await page.goto(edit(code))
  await page.getByRole('button', { name: 'Действия с данными' }).click()
  await page.getByRole('button', { name: 'Очистить план' }).click()
  await page.getByRole('button', { name: 'Очистить план', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Замените Excel живым таймлайном' })).toBeVisible()
  await page.goto(`/w/${code}/edit/settings/data`)
  await page.locator('input[type=file]').setInputFiles(file!)
  await expect(page.locator('.import-preview').first()).toContainText('epics')
  await page.getByRole('button', { name: 'Заменить workspace' }).click()
  await page.goto(edit(code))
  await expect(page.getByRole('row', { name: /CPM–CPA аукцион/ })).toBeVisible()
})

test('blocked epic selectors and red borders preserve solid and striped marker fills in both themes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Epic status and styles are covered in Chromium')
  const code = codes.blocked.code
  await page.goto(edit(code))
  await page.getByLabel('PIN').fill('5678')
  await page.getByRole('button', { name: 'Открыть редактирование' }).click()
  await expect(page.getByRole('button', { name: 'Завершить редактирование' })).toBeVisible()
  const current = (await (await page.request.get(`/api/workspaces/${code}`)).json()).data
  const ids: string[] = []
  for (const [index, fillStyle] of ['solid', 'striped'].entries()) {
    const response = await page.request.post(`/api/workspaces/${code}/epics`, {
      data: { expectedRevision: current.workspace.revision + index, data: { title: `Blocked ${fillStyle}`, status: 'blocked', marker: '#14b8a6', fillStyle } },
    })
    expect(response.status()).toBe(201)
    ids.push((await response.json()).data.id)
  }
  await page.reload()
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.classList.toggle('dark', value === 'dark')
      document.documentElement.classList.toggle('light', value === 'light')
    }, theme)
    for (const [index, fillStyle] of ['solid', 'striped'].entries()) {
      const bar = page.locator(`.gantt_task_line[task_id="epic:${ids[index]}"]`)
      await expect(bar).toHaveClass(/epic-bar.*status-blocked/)
      await expect(bar).toHaveCSS('outline-color', 'rgb(239, 68, 68)')
      await expect(bar).toHaveCSS('outline-width', '2px')
      await expect(bar).toHaveCSS('border-top-color', 'rgb(239, 68, 68)')
      await expect(bar).toHaveCSS('border-top-style', 'solid')
      await expect(bar).toHaveCSS('border-top-width', '2px')
      await expect(bar).toHaveCSS('background-color', 'rgb(20, 184, 166)')
      if (fillStyle === 'striped') {
        await expect(bar).toHaveClass(/epic-striped/)
        await expect(bar).toHaveCSS('background-image', /repeating-linear-gradient/)
      }
    }
  }
  const bar = page.locator(`.gantt_task_line[task_id="epic:${ids[0]}"]`)
  await bar.dblclick()
  const modal = page.getByRole('dialog')
  await expect(modal.getByRole('combobox', { name: 'Статус', exact: true })).toHaveValue('blocked')
  await modal.getByRole('combobox', { name: 'Статус', exact: true }).selectOption('active')
  await modal.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(bar).not.toHaveClass(/status-blocked/)
  await expect(bar).toHaveCSS('outline-style', 'none')
  await bar.dblclick()
  await modal.getByRole('combobox', { name: 'Статус', exact: true }).selectOption('blocked')
  await modal.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(bar).toHaveClass(/status-blocked/)
  await page.reload()
  await expect(bar).toHaveClass(/status-blocked/)
  await page.goto(`/w/${code}/edit/projects/${ids[0]}`)
  await page.getByLabel('Статус эпика').selectOption('blocked')
  await expect(page.locator('.epic-hero')).toHaveCSS('border-top-color', 'rgb(239, 68, 68)')
  await page.reload()
  await expect(page.getByLabel('Статус эпика')).toHaveValue('blocked')
  await page.goto(`/w/${code}/view/projects`)
  const card = page.locator('.project-card').filter({ hasText: 'Blocked solid' })
  await expect(card).toHaveClass(/status-blocked/)
  await expect(card).toHaveCSS('border-top-color', 'rgb(239, 68, 68)')
  await expect(card.locator('.status-blocked')).toHaveText('blocked')
})
