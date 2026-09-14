import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { ModelConfigurationStore, type SecretEncryption } from './model-configuration-store'

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rename: vi.fn(actual.rename) }
})
const temporary: string[] = []
const config = { apiKey: 'SYNTHETIC_API_KEY_ONLY', modelId: 'deepseek-flash', endpoint: 'https://api.deepseek.com/chat/completions' }
async function setup() {
  const dir = await fs.mkdtemp(join(tmpdir(), 'wememo-model-store-')); temporary.push(dir)
  const key = randomBytes(32)
  const encryption: SecretEncryption = {
    available: vi.fn(async () => true),
    encrypt: vi.fn(async value => {
      const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv)
      return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()])
    }),
    decrypt: vi.fn(async value => {
      const cipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); cipher.setAuthTag(value.subarray(-16))
      return Buffer.concat([cipher.update(value.subarray(12, -16)), cipher.final()]).toString('utf8')
    })
  }
  return { dir, encryption, store: new ModelConfigurationStore(dir, encryption) }
}
afterEach(async () => { vi.mocked(fs.rename).mockClear(); await Promise.all(temporary.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))) })
describe('separate encrypted model configuration', () => {
  it('round-trips across store instances without plaintext keys and uses private file permissions', async () => {
    const { dir, encryption, store } = await setup()
    expect(await store.load()).toBeUndefined()
    await store.save(config)
    expect(await new ModelConfigurationStore(dir, encryption).load()).toEqual(config)
    const files = await fs.readdir(dir)
    expect(files).toHaveLength(2)
    expect(files).toContain('provider.json')
    for (const file of files) {
      expect((await fs.readFile(join(dir, file))).includes(Buffer.from(config.apiKey))).toBe(false)
      expect((await fs.stat(join(dir, file))).mode & 0o777).toBe(0o600)
    }
    expect((await fs.stat(dir)).mode & 0o777).toBe(0o700)
  })
  it('leaves old settings intact if metadata commit fails and removes the staged secret', async () => {
    const { dir, store } = await setup(); await store.save(config)
    const originalFiles = (await fs.readdir(dir)).sort()
    vi.mocked(fs.rename).mockRejectedValueOnce(new Error('PRIVATE DISK PATH'))
    await expect(store.save({ ...config, apiKey: 'REPLACEMENT_KEY', modelId: 'deepseek-reasoner' })).rejects.toThrow('storage-failed')
    expect(await store.load()).toEqual(config)
    expect((await fs.readdir(dir)).sort()).toEqual(originalFiles)
  })
  it('replaces a key and removes the previous ciphertext after commit', async () => {
    const { dir, store } = await setup(); await store.save(config)
    const before = await fs.readdir(dir)
    await store.save({ ...config, apiKey: 'SECOND_SYNTHETIC_KEY' })
    expect((await store.load())?.apiKey).toBe('SECOND_SYNTHETIC_KEY')
    const after = await fs.readdir(dir)
    expect(after).toHaveLength(2)
    expect(after.find(file => file.endsWith('.bin'))).not.toBe(before.find(file => file.endsWith('.bin')))
  })
  it('allows an explicit new key to recover corrupt metadata without following its paths', async () => {
    const { dir, store } = await setup()
    await fs.writeFile(join(dir, 'provider.json'), '{broken')
    await expect(store.load()).rejects.toThrow('storage-failed')
    await store.save(config)
    expect(await store.load()).toEqual(config)
  })
  it('does not mistake a chance ciphertext byte for a short plaintext key', async () => {
    const { store } = await setup()
    await store.save({ ...config, apiKey: 'x' })
    expect((await store.load())?.apiKey).toBe('x')
  })
  it('fails closed when encryption is unavailable or accidentally returns plaintext', async () => {
    const { dir, encryption, store } = await setup()
    vi.mocked(encryption.available).mockResolvedValue(false)
    await expect(store.save(config)).rejects.toThrow('storage-unavailable')
    expect(await fs.readdir(dir)).toEqual([])
    vi.mocked(encryption.available).mockResolvedValue(true)
    vi.mocked(encryption.encrypt).mockImplementation(async text => Buffer.from(text))
    await expect(store.save(config)).rejects.toThrow('storage-failed')
    expect(await fs.readdir(dir)).toEqual([])
  })
  it.each(['missing-secret', 'traversal', 'oversize', 'symbolic-secret', 'symbolic-directory'])('rejects %s without unsafe reads', async kind => {
    const { dir, store, encryption } = await setup(); await store.save(config)
    const metadata = JSON.parse(await fs.readFile(join(dir, 'provider.json'), 'utf8'))
    const secret = join(dir, `${metadata.credentialId}.bin`)
    if (kind === 'missing-secret') await fs.unlink(secret)
    if (kind === 'traversal') await fs.writeFile(join(dir, 'provider.json'), JSON.stringify({ ...metadata, credentialId: '../outside' }))
    if (kind === 'oversize') await fs.writeFile(secret, Buffer.alloc(32769))
    if (kind === 'symbolic-secret') { await fs.unlink(secret); await fs.symlink(join(dir, 'provider.json'), secret) }
    if (kind === 'symbolic-directory') {
      const link = join(dir, 'linked'); await fs.symlink(dir, link)
      await expect(new ModelConfigurationStore(link, encryption).load()).rejects.toThrow('storage-failed')
    } else await expect(store.load()).rejects.toThrow('storage-failed')
  })
})
