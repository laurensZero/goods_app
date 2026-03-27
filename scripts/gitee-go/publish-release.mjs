import { readFile } from 'node:fs/promises'

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || value == null) {
      throw new Error(`Invalid arguments near ${key ?? '<end>'}`)
    }
    args[key.slice(2)] = value
  }
  return args
}

async function readOptional(path) {
  if (!path) return ''
  return readFile(path, 'utf8')
}

function resolveReleaseId(payload) {
  return String(payload?.id || payload?.release?.id || '').trim()
}

function collectExistingAssetNames(payload) {
  const assetGroups = [
    payload?.assets,
    payload?.attach_files,
    payload?.files,
    payload?.release?.assets,
    payload?.release?.attach_files,
    payload?.release?.files
  ]

  const names = new Set()
  for (const group of assetGroups) {
    if (!Array.isArray(group)) continue
    for (const item of group) {
      const name = String(item?.name || item?.filename || '').trim()
      if (name) names.add(name)
    }
  }
  return names
}

async function api(url, init, expectedStatuses = [200]) {
  const response = await fetch(url, init)
  const text = await response.text()
  let json = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
  }

  if (!expectedStatuses.includes(response.status)) {
    const message = json?.message || text || `Request failed with status ${response.status}`
    const error = new Error(message)
    error.status = response.status
    error.payload = json
    throw error
  }

  return { response, text, json }
}

const args = parseArgs(process.argv.slice(2))

const owner = args.owner
const repo = args.repo
const token = args.token
const tag = args.tag
const target = args.target || tag
const name = args.name || tag
const apkPath = args.apk
const assetName = args['asset-name'] || `${tag}.apk`
const notes = await readOptional(args['notes-file'])

for (const [field, value] of Object.entries({ owner, repo, token, tag, apkPath })) {
  if (!String(value || '').trim()) {
    throw new Error(`Missing required argument: ${field}`)
  }
}

const apiBase = `https://gitee.com/api/v5/repos/${owner}/${repo}`
const releaseByTagUrl = `${apiBase}/releases/tags/${encodeURIComponent(tag)}?access_token=${encodeURIComponent(token)}`

let releasePayload = null
try {
  const result = await api(releaseByTagUrl, {}, [200])
  releasePayload = result.json
} catch (error) {
  if (error.status !== 404) throw error
}

if (!releasePayload) {
  const form = new URLSearchParams()
  form.set('access_token', token)
  form.set('tag_name', tag)
  form.set('target_commitish', target)
  form.set('name', name)
  form.set('body', notes)

  const created = await api(`${apiBase}/releases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form
  }, [200, 201])

  releasePayload = created.json
}

const releaseId = resolveReleaseId(releasePayload)
if (!releaseId) {
  throw new Error('Unable to resolve Gitee release id.')
}

const existingAssetNames = collectExistingAssetNames(releasePayload)
if (existingAssetNames.has(assetName)) {
  console.log(`Asset already exists on Gitee release, skip upload: ${assetName}`)
  process.exit(0)
}

const fileBuffer = await readFile(apkPath)
const uploadForm = new FormData()
uploadForm.append('access_token', token)
uploadForm.append('file', new Blob([fileBuffer]), assetName)

await api(`${apiBase}/releases/${releaseId}/attach_files`, {
  method: 'POST',
  body: uploadForm
}, [200, 201])

console.log(`Uploaded ${assetName} to Gitee release ${owner}/${repo}@${tag}`)
