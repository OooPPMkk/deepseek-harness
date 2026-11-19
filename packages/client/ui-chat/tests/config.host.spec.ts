import { Context } from '@deepseek-ai/cordis'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as HostPlugin from '../src/index.ts'
import { liveConfig, omitsGeneratedPage } from '../../../settings/settings/tests/live-config.ts'
import { configurationFixture } from '../../../settings/settings/tests/configuration-fixture.ts'
import { plainConfig } from '../../../settings/settings/src/schema.ts'
import {
  Config, apply,
} from '../src/index.ts'


describe('ui-chat Host settings', () => {
  it('registers, validates, and disposes the transcript-view namespace', async () => {
    const ctx = new Context()
    const configuration = await liveConfig(ctx, { Config, apply })
    const { fiber } = configuration

    expect(plainConfig(configuration.fiber.effectiveConfig)).toEqual({
      performanceUsage: 'detailed', linkOpening: 'sidebar', collapseTiming: 'completion', foldedReplies: 'all',
      reasoningDisclosure: 'collapsed',
    })
    await configuration.update({ transcriptView: 'normal' })
    expect(plainConfig(configuration.fiber.effectiveConfig)).toEqual({
      transcriptView: 'normal', performanceUsage: 'detailed', linkOpening: 'sidebar', collapseTiming: 'completion', foldedReplies: 'all',
      reasoningDisclosure: 'collapsed',
    })
    for (const mode of ['expanded', 'compact', 'standard', 'detailed', 'verbose']) {
      await configuration.update({ transcriptView: mode })
      expect(plainConfig(configuration.fiber.effectiveConfig)).toMatchObject({ transcriptView: mode })
    }
    for (const mode of ['dense', '', 42, false, {}, null, undefined]) {
      await configuration.update({ transcriptView: mode })
      expect(plainConfig(configuration.fiber.effectiveConfig)).toMatchObject({ transcriptView: mode === null ? null : undefined })
    }
    await configuration.update({ performanceUsage: 'compact' })
    expect(plainConfig(configuration.fiber.effectiveConfig)).toMatchObject({ performanceUsage: 'compact' })
    await expect(configuration.update({ performanceUsage: 'hidden' })).rejects.toThrow()
    await configuration.update({ linkOpening: 'new-tab' })
    expect(plainConfig(configuration.fiber.effectiveConfig)).toMatchObject({ linkOpening: 'new-tab' })
    await expect(configuration.update({ linkOpening: 'popup' })).rejects.toThrow()
    await configuration.update({ reasoningDisclosure: 'expanded' })
    expect(plainConfig(configuration.fiber.effectiveConfig)).toMatchObject({ reasoningDisclosure: 'expanded' })
    await expect(configuration.update({ reasoningDisclosure: 'open' })).rejects.toThrow()

    await fiber.dispose()
  })

  it('validates collapse timing and restores its saved config independently of work details', async () => {
    const ctx = new Context()
    const configuration = await liveConfig(ctx, { Config, apply })
    expect(plainConfig(configuration.fiber.effectiveConfig)).toMatchObject({ collapseTiming: 'completion' })
    await configuration.update({ transcriptView: 'compact', collapseTiming: 'next-input' })
    const saved = plainConfig(configuration.fiber.effectiveConfig)
    if (typeof saved !== 'object' || saved === null) throw new Error('expected saved configuration object')
    expect(saved).toMatchObject({ transcriptView: 'compact', collapseTiming: 'next-input' })
    await expect(configuration.update({ collapseTiming: 'never' })).rejects.toThrow()
    await configuration.fiber.dispose()
    const restored = await liveConfig(ctx, { Config, apply }, saved)
    expect(plainConfig(restored.fiber.effectiveConfig)).toMatchObject({ transcriptView: 'compact', collapseTiming: 'next-input' })
    await restored.fiber.dispose()
  })

  it('validates folded replies and restores the saved choice', async () => {
    const ctx = new Context()
    const configuration = await liveConfig(ctx, { Config, apply })
    expect(plainConfig(configuration.fiber.effectiveConfig)).toMatchObject({ foldedReplies: 'all' })
    await configuration.update({ foldedReplies: 'final' })
    const saved = plainConfig(configuration.fiber.effectiveConfig)
    if (typeof saved !== 'object' || saved === null) throw new Error('expected saved configuration object')
    expect(saved).toMatchObject({ foldedReplies: 'final' })
    await expect(configuration.update({ foldedReplies: 'none' })).rejects.toThrow()
    await configuration.fiber.dispose()
    const restored = await liveConfig(ctx, { Config, apply }, saved)
    expect(plainConfig(restored.fiber.effectiveConfig)).toMatchObject({ foldedReplies: 'final' })
    await restored.fiber.dispose()
  })

  it('loads without a settings provider', async () => {
    const ctx = new Context()
    await expect(ctx.plugin({ Config, apply }).await()).resolves.toBeDefined()
  })
})

it('persists the reasoning disclosure through the settings service', async () => {
  // The browser writes this preference through `settings.mutate`, whose volatile-path
  // gate rejects any field the running Host schema does not declare.
  const { ctx, profile } = await configurationFixture({ schema: Config, apply })
  const value = () => ctx.settings.describe({ redactSecrets: true }).find(row => row.ns === 'first')!.value
  expect(value()).toMatchObject({ reasoningDisclosure: 'collapsed' })
  await ctx.settings.mutate('first', [{ op: 'set', path: ['reasoningDisclosure'], value: 'expanded' }])
  expect(value()).toMatchObject({ reasoningDisclosure: 'expanded' })
  expect(readFileSync(profile.patchPath, 'utf8')).toContain('reasoningDisclosure: expanded')
  await expect(ctx.settings.mutate('first', [{ op: 'set', path: ['reasoningDisclosure'], value: 'open' }]))
    .rejects.toThrow()
  await ctx.settings.mutate('first', [{ op: 'unset', path: ['reasoningDisclosure'] }])
  expect(value()).toMatchObject({ reasoningDisclosure: 'collapsed' })
})

it('keeps its own instance off the generated Settings pages', () => omitsGeneratedPage(ctx => ctx.plugin(HostPlugin)))
