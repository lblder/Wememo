import { randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { validateSaveModelSettings } from '../../shared/model-settings'
import type { DeepSeekConfiguration } from './deepseek-config'

export interface SecretEncryption {
  available(): Promise<boolean>
  encrypt(value: string): Promise<Buffer>
  decrypt(value: Buffer): Promise<string>
}
export class ModelStorageError extends Error {
  constructor(readonly code: 'storage-unavailable' | 'storage-failed') { super(code); this.name = 'ModelStorageError' }
}
interface Metadata { version: 1; baseUrl: string; modelId: string; credentialId: string }
const credentialName = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/

/** A new encrypted credential is staged before atomically replacing its metadata pointer.
 * Failed saves leave the previous complete configuration readable. Paths are Main-owned.
 */
export class ModelConfigurationStore {
  constructor(private readonly directory: string, private readonly encryption: SecretEncryption) {}
  async available(): Promise<boolean> {
    try { return await this.encryption.available() } catch { return false }
  }
  private async safeRead(path: string, maximum: number): Promise<Buffer> {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) throw new ModelStorageError('storage-failed')
    const bytes = await readFile(path)
    if (bytes.length > maximum) throw new ModelStorageError('storage-failed')
    return bytes
  }
  private async metadata(): Promise<Metadata | undefined> {
    let bytes: Buffer
    try {
      const directory = await lstat(this.directory)
      if (!directory.isDirectory() || directory.isSymbolicLink()) throw new ModelStorageError('storage-failed')
      bytes = await this.safeRead(join(this.directory, 'provider.json'), 4096)
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
    const data = JSON.parse(bytes.toString('utf8')) as Metadata
    if (!data || typeof data !== 'object' || Object.keys(data).sort().join(',') !== 'baseUrl,credentialId,modelId,version' ||
      data.version !== 1 || typeof data.credentialId !== 'string' || !credentialName.test(data.credentialId)) throw new ModelStorageError('storage-failed')
    validateSaveModelSettings({ baseUrl: data.baseUrl, modelId: data.modelId })
    return data
  }
  async load(): Promise<DeepSeekConfiguration | undefined> {
    try {
      const metadata = await this.metadata()
      if (!metadata) return undefined
      if (!await this.available()) throw new ModelStorageError('storage-unavailable')
      const apiKey = await this.encryption.decrypt(await this.safeRead(join(this.directory, `${metadata.credentialId}.bin`), 32768))
      const checked = validateSaveModelSettings({ baseUrl: metadata.baseUrl, modelId: metadata.modelId, apiKey })
      if (!checked.apiKey) throw new ModelStorageError('storage-failed')
      return { apiKey: checked.apiKey, modelId: checked.modelId, endpoint: `${checked.baseUrl}/chat/completions` }
    } catch (error) { throw error instanceof ModelStorageError ? error : new ModelStorageError('storage-failed') }
  }
  async save(configuration: DeepSeekConfiguration): Promise<void> {
    let credentialPath: string | undefined
    let temporaryPath: string | undefined
    let committed = false
    try {
      if (!await this.available()) throw new ModelStorageError('storage-unavailable')
      const checked = validateSaveModelSettings({ baseUrl: configuration.endpoint.replace(/\/chat\/completions$/, ''), modelId: configuration.modelId, apiKey: configuration.apiKey })
      if (!checked.apiKey) throw new ModelStorageError('storage-failed')
      await mkdir(this.directory, { recursive: true, mode: 0o700 })
      const directory = await lstat(this.directory)
      if (!directory.isDirectory() || directory.isSymbolicLink()) throw new ModelStorageError('storage-failed')
      await chmod(this.directory, 0o700)
      // An explicit save with a supplied valid key can replace corrupt metadata.
      // Never derive a cleanup path from an invalid pointer.
      const previous = await this.metadata().catch(() => undefined)
      const credentialId = randomUUID()
      credentialPath = join(this.directory, `${credentialId}.bin`)
      temporaryPath = join(this.directory, `${credentialId}.tmp`)
      const encrypted = await this.encryption.encrypt(checked.apiKey)
      const plain = Buffer.from(checked.apiKey)
      if (!encrypted.length || encrypted.equals(plain) || (plain.length >= 12 && encrypted.includes(plain))) throw new ModelStorageError('storage-failed')
      await writeFile(credentialPath, encrypted, { flag: 'wx', mode: 0o600 })
      const metadata: Metadata = { version: 1, baseUrl: checked.baseUrl, modelId: checked.modelId, credentialId }
      await writeFile(temporaryPath, JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
      await rename(temporaryPath, join(this.directory, 'provider.json'))
      committed = true
      if (previous) await unlink(join(this.directory, `${previous.credentialId}.bin`)).catch(() => {})
    } catch (error) { throw error instanceof ModelStorageError ? error : new ModelStorageError('storage-failed') }
    finally {
      if (temporaryPath) await unlink(temporaryPath).catch(() => {})
      if (!committed && credentialPath) await unlink(credentialPath).catch(() => {})
    }
  }
}
