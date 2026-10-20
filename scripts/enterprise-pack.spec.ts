/** Real npm archive checks for a detachable enterprise bundle. */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, expect, it } from 'vitest'
import { packEnterprise } from '../enterprise/pack.mjs'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'enterprise-pack-'))
  roots.push(root)
  mkdirSync(join(root, 'enterprise'))
  mkdirSync(join(root, 'vendor'))
  mkdirSync(join(root, 'vendor/sdk'))
  writeFileSync(join(root, 'vendor/sdk/package.json'), JSON.stringify({ name: '@example/sdk', version: '9.0.0' }))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }))
  writeFileSync(join(root, '.env'), 'SECRET=must-not-be-packed\n')
  const paths = ['packages/bundle/enterprise', 'packages/credentials/enterprise-account']
  writeFileSync(join(root, 'enterprise/packages.json'), JSON.stringify(paths))
  for (const [index, path] of paths.entries()) {
    const dir = join(root, path)
    mkdirSync(join(dir, 'lib'), { recursive: true })
    writeFileSync(join(dir, 'lib/index.js'), 'export const apply = () => {}\n')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: index === 0 ? '@example/enterprise-bundle' : '@example/enterprise-account',
      version: '1.0.0', main: 'lib/index.js', type: 'module',
      ...index === 0 ? {
        dsh: { bundle: { patch: './cordis.patch.yml' } },
        dependencies: { '@example/enterprise-account': 'workspace:*', '@example/sdk': 'workspace:~' },
      } : {},
    }))
  }
  writeFileSync(join(root, paths[0] ?? '', 'cordis.patch.yml'), '- insert: []\n')
  return root
}

it('packs private plugins inside one archive without workspace versions or local secrets', () => {
  const root = fixture()
  const archive = packEnterprise(root, join(root, 'release'))
  const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
  expect(files).toContain('package/node_modules/@example/enterprise-account/lib/index.js')
  expect(files.split('\n')).not.toContain('package/.env')
  const manifest = execFileSync('tar', ['-xOzf', archive, 'package/package.json'], { encoding: 'utf8' })
  expect(manifest).not.toContain('workspace:')
  expect(JSON.parse(manifest)).toMatchObject({
    dependencies: { '@example/enterprise-account': '1.0.0' },
    peerDependencies: { '@example/sdk': '9.0.0' },
    bundleDependencies: ['@example/enterprise-account'],
  })
  expect(JSON.parse(manifest)).not.toHaveProperty(['dependencies', '@example/sdk'])
  expect(JSON.parse(readFileSync(join(archive, '..', 'compatibility.json'), 'utf8'))).toMatchObject({ harnessVersion: '1.0.0' })
})

it('rejects missing build artifacts instead of emitting a partial release', () => {
  const root = fixture()
  rmSync(join(root, 'packages/credentials/enterprise-account/lib/index.js'))
  expect(() => packEnterprise(root, join(root, 'release'))).toThrow('Build packages/credentials/enterprise-account before packing')
})
