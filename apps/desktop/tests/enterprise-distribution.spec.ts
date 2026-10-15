/** Enterprise Desktop edition embeds only public configuration and projects it to the Host. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  enterpriseHostEnvironment,
  loadDesktopEnterpriseDistribution,
  resolveDesktopEnterpriseDistribution,
} from '../src/enterprise-distribution.mjs'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

const config = {
  issuer: 'https://admin.example.test',
  clientId: 'desktop-public-client',
  gatewayBaseURL: 'https://admin.example.test/v1',
  models: [{ id: 'coding-model', name: 'Coding model' }],
  allowLoopbackHttp: false,
}

it('loads one package-owned enterprise flavor without a client secret', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-enterprise-desktop-'))
  roots.push(root)
  writeFileSync(join(root, 'enterprise.json'), JSON.stringify(config))
  const resolved = loadDesktopEnterpriseDistribution({ DSH_DESKTOP_ENTERPRISE_CONFIG: './enterprise.json' }, root)
  expect(resolved).toEqual(config)
  const environment = enterpriseHostEnvironment(resolved!)
  expect(environment).toMatchObject({
    DSH_ENTERPRISE_DESKTOP_OIDC_CLIENT_ID: 'desktop-public-client',
    DSH_ENTERPRISE_OIDC_ISSUER: 'https://admin.example.test',
    DSH_ENTERPRISE_GATEWAY_BASE_URL: 'https://admin.example.test/v1',
  })
  expect(Object.keys(environment).some(name => name.includes('SECRET'))).toBe(false)
})

it('embeds the public enterprise flavor in an installable Desktop manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-enterprise-desktop-'))
  roots.push(root)
  const path = join(root, 'enterprise.json')
  writeFileSync(path, JSON.stringify(config))
  const builder = createElectronBuilderConfig({
    DSH_DESKTOP_APP_ID: 'com.example.enterprise-harness',
    DSH_DESKTOP_ENTERPRISE_CONFIG: path,
    DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.test',
    DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({
      allowedAuthOrigins: ['https://login.example.test'],
    }),
    DSH_DESKTOP_UNSIGNED: '1',
  }, 'win32', 'x64')
  expect(builder.extraMetadata).toMatchObject({ dshEnterpriseDistribution: config })
  expect(JSON.stringify(builder.extraMetadata)).not.toContain('clientSecret')
})

it('rejects secrets and incomplete enterprise release settings', () => {
  expect(() => resolveDesktopEnterpriseDistribution({ ...config, clientSecret: 'must-not-ship' }))
    .toThrow('invalid distribution configuration')
  for (const secret of [{ clientSecret: 'must-not-ship' }, { apiKey: 'must-not-ship' }]) {
    expect(() => resolveDesktopEnterpriseDistribution({
      ...config,
      models: [{ ...config.models[0], ...secret }],
    })).toThrow('models must contain Harness Admin model codes')
  }
  expect(() => resolveDesktopEnterpriseDistribution({ ...config, models: [] }))
    .toThrow('models must contain Harness Admin model codes')
})
