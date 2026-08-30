import * as fs from 'node:fs'
import * as path from 'node:path'

import { type MockBackendFixture, setupMockBackend, waitForAppReady } from './fixtures'
import { expect, test } from './test'

let fixture: MockBackendFixture | null = null

test.beforeAll(async () => {
  fixture = await setupMockBackend()
  await waitForAppReady(fixture, 120_000)
})

test.afterAll(async () => {
  await fixture?.cleanup()
  fixture = null
})

test('bare Tab visibly toggles Plan and the backend blocks writes', async ({ page: _page }, testInfo) => {
  const { page, sandbox } = fixture!
  const composer = page.locator('[contenteditable="true"]').first()
  const composerSurface = page.locator('[data-slot="composer-surface"]').first()
  const composerFill = composerSurface.locator('[data-slot="composer-fill"]')
  const planIndicator = page.getByRole('status', { name: 'Plan Mode on' })
  const canary = path.join(sandbox.root, 'plan-mode-hello-world.py')

  await expect(planIndicator).toHaveCount(0)

  const normalComposerVisual = await composerSurface.evaluate(element => {
    const style = getComputedStyle(element)
    const fill = element.querySelector('[data-slot="composer-fill"]')

    return {
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      fillBackground: fill ? getComputedStyle(fill).backgroundColor : null
    }
  })

  await composer.click()
  await page.keyboard.press('Tab')
  await expect(planIndicator).toBeVisible()
  await expect(planIndicator).toHaveText('PLAN')
  await expect(page.locator('[data-slot="plan-mode-tab"]')).toHaveCount(0)
  await expect(composerSurface).toHaveAttribute('data-execution-mode', 'plan')
  await expect(composer).toHaveAttribute('data-placeholder', 'Describe what you want planned…')
  await expect
    .poll(() => composerSurface.evaluate(element => getComputedStyle(element).boxShadow))
    .not.toBe(normalComposerVisual.boxShadow)

  const visual = await planIndicator.evaluate(element => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    const previous = element.previousElementSibling?.getBoundingClientRect()
    const controls = element.closest('[data-slot="composer-controls"]')

    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      width: rect.width,
      height: rect.height,
      insideControls: controls?.contains(element) ?? false,
      previousRight: previous?.right ?? null,
      previousCenterY: previous ? previous.top + previous.height / 2 : null,
      indicatorLeft: rect.left,
      indicatorCenterY: rect.top + rect.height / 2
    }
  })

  expect(visual.width).toBeGreaterThan(0)
  expect(visual.height).toBeGreaterThan(0)
  expect(visual.color).not.toBe('rgba(0, 0, 0, 0)')
  expect(visual.backgroundColor).toBe('rgba(0, 0, 0, 0)')
  expect(visual.borderTopWidth).toBe('0px')
  expect(visual.borderRightWidth).toBe('0px')
  expect(visual.borderBottomWidth).toBe('0px')
  expect(visual.borderLeftWidth).toBe('0px')
  expect(visual.insideControls).toBe(true)
  expect(visual.previousRight).not.toBeNull()
  expect(visual.previousCenterY).not.toBeNull()
  expect(visual.indicatorLeft).toBeGreaterThanOrEqual(visual.previousRight!)
  expect(Math.abs(visual.indicatorCenterY - visual.previousCenterY!)).toBeLessThanOrEqual(4)

  const planComposerVisual = await composerSurface.evaluate(element => {
    const style = getComputedStyle(element)
    const fill = element.querySelector('[data-slot="composer-fill"]')

    return {
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      fillBackground: fill ? getComputedStyle(fill).backgroundColor : null
    }
  })

  expect(planComposerVisual.boxShadow).not.toBe('none')
  expect(planComposerVisual.boxShadow).not.toBe(normalComposerVisual.boxShadow)
  expect(planComposerVisual.fillBackground).not.toBe(normalComposerVisual.fillBackground)
  await expect(composerFill).toBeVisible()

  await page.screenshot({ path: testInfo.outputPath('plan-mode-on.png') })

  await composer.click()
  await composer.type(`E2E_PLAN_MODE_WRITE_TRIGGER ${canary}`)
  await page.keyboard.press('Enter')
  await expect(page.getByText('Plan write and terminal attempts blocked.')).toBeVisible({ timeout: 60_000 })
  expect(fs.existsSync(canary), 'Plan turn must block write_file before it reaches disk').toBe(false)
  await expect(planIndicator).toBeVisible()

  // Submitting or repeating the request must never toggle Plan. This mirrors
  // the reported conversation: every "do it" remains read-only until the user
  // explicitly presses bare Tab.
  for (let attempt = 1; attempt <= 2; attempt++) {
    await composer.click()
    await composer.type('do it')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Still blocked by Plan Mode.')).toHaveCount(attempt, { timeout: 60_000 })
    await expect(planIndicator).toBeVisible()
    await expect(composerSurface).toHaveAttribute('data-execution-mode', 'plan')
    expect(fs.existsSync(canary), `Plan follow-up ${attempt} must remain read-only`).toBe(false)
  }

  await composer.click()
  await page.keyboard.press('Tab')
  await expect(planIndicator).toHaveCount(0)
  await expect(composerSurface).toHaveAttribute('data-execution-mode', 'normal')
  await expect(composer).not.toHaveAttribute('data-placeholder', 'Describe what you want planned…')
  await expect
    .poll(() => composerSurface.evaluate(element => getComputedStyle(element).boxShadow))
    .toBe(normalComposerVisual.boxShadow)

  await composer.click()
  await composer.type('do it')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Normal follow-up executed: hello world')).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => fs.existsSync(canary), { timeout: 60_000 }).toBe(true)
  expect(fs.readFileSync(canary, 'utf8')).toBe("print('hello world')\n")
  await page.screenshot({ path: testInfo.outputPath('normal-followup-succeeded.png') })
})
