import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  const externalRequests: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:3100') && !/^(blob:|data:)/.test(request.url())) externalRequests.push(request.url())
  })
  await page.goto('/timeline')
  await expect(page.getByRole('heading', { name: 'Замените Excel живым таймлайном' })).toBeVisible()
  await page.getByRole('button', { name: 'Загрузить демо' }).click()
  await expect(page.getByText('CPM–CPA аукцион', { exact: true }).first()).toBeVisible()
  await page.reload()
  await expect(page.getByText('CPM–CPA аукцион', { exact: true }).first()).toBeVisible()
  expect(errors).toEqual([])
  expect(externalRequests).toEqual([])
})

test('baseline overlay, table synchronization and print view', async ({ page }) => {
  await page.getByRole('button', { name: 'Создать baseline' }).click()
  await page.getByLabel('Название').fill('Согласовано E2E')
  await page.getByRole('button', { name: 'Создать snapshot' }).click()
  await expect(page.getByLabel('Baseline для сравнения')).toHaveValue(/baseline-/)

  await page.getByRole('link', { name: 'Таблица' }).click()
  await expect(page).toHaveURL(/\/table$/)
  const stageLink = page.getByRole('link', { name: 'CPM: разработка стратегии', exact: true }).first()
  await expect(stageLink).toBeVisible()
  const row = stageLink.locator('xpath=ancestor::tr')
  await row.getByLabel('Статус').selectOption('in_progress')

  await row.getByLabel('Открыть на таймлайне').click()
  await expect(page).toHaveURL(/\/timeline\?stage=/)
  await expect(page.locator('.gantt-baseline').first()).toBeVisible()

  await page.goto('/print')
  await expect(page.getByRole('heading', { name: 'CPM–CPA аукцион' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Печать / сохранить PDF' })).toBeVisible()
})

test('backup is created and remains available after reload', async ({ page }) => {
  await page.goto('/settings/data')
  await page.getByPlaceholder('Название snapshot').fill('E2E snapshot')
  await page.getByRole('button', { name: 'Создать backup' }).click()
  await expect(page.getByText('E2E snapshot').first()).toBeVisible()
  await expect(page.locator('.integrity-line')).toContainText('подтверждена')
  await page.reload()
  await expect(page.getByText('E2E snapshot').first()).toBeVisible()
})

test('full JSON export is downloadable without network export API', async ({ page }) => {
  await page.goto('/settings/data')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспортировать всё' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^delivery-planner-\d{4}-\d{2}-\d{2}\.json$/)
})

test('PNG export is generated locally in the browser', async ({ page }) => {
  await page.getByRole('button', { name: 'Действия с данными' }).click()
  await page.getByRole('button', { name: 'Экспорт PNG…' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать PNG' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^delivery-plan-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.png$/)
})

test('replace import is atomic and its pre-import backup can be restored', async ({ page }) => {
  await page.goto('/settings/data')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспортировать всё' }).click()
  const filePath = await (await downloadPromise).path()
  expect(filePath).toBeTruthy()

  await page.goto('/timeline')
  await page.getByRole('button', { name: 'Действия с данными' }).click()
  await page.getByRole('button', { name: 'Очистить план' }).click()
  await page.getByRole('button', { name: 'Очистить план', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Замените Excel живым таймлайном' })).toBeVisible()

  await page.goto('/settings/data')
  await page.locator('input[type=file]').setInputFiles(filePath!)
  await expect(page.locator('.import-preview')).toContainText('epics')
  await page.getByRole('button', { name: 'Заменить workspace' }).click()
  await expect(page.getByText('Готово', { exact: true }).last()).toBeVisible()
  await page.goto('/timeline')
  await expect(page.getByText('CPM–CPA аукцион', { exact: true }).first()).toBeVisible()

  await page.goto('/settings/data')
  const preImport = page.locator('.backup-row').filter({ hasText: 'Перед импортом' }).first()
  await expect(preImport).toBeVisible()
  await preImport.getByRole('button', { name: 'Просмотр' }).click()
  await expect(page.getByRole('heading', { name: 'Содержимое backup' })).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Восстановить эту копию' }).click()
  await expect(page.getByText('Готово', { exact: true }).last()).toBeVisible()
  await page.goto('/timeline')
  await expect(page.getByRole('heading', { name: 'Замените Excel живым таймлайном' })).toBeVisible()
})

test('navigation exposes all MVP routes', async ({ page }) => {
  for (const [label, route] of [['Проекты', '/projects'], ['Команда', '/team'], ['Таблица', '/table'], ['Настройки', '/settings/data']] as const) {
    await page.getByRole('link', { name: label }).click()
    await expect(page).toHaveURL(new RegExp(`${route.replace('/', '\\/')}$`))
  }
})
