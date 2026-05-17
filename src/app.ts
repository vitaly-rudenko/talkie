import { exec } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execAsync = promisify(exec)
const exitIfEmpty = async (path: string) => {
  const stats = await stat(path).catch(() => null)
  if (!stats || stats.size === 0) process.exit(0)
}

const MAX_OLD_OPERATIONS = 5
const WHISPER_MODEL_PATH = join(homedir(), 'ggml-large-v3-turbo-q5_0.bin')
const WHISPER_VAD_MODEL_PATH = join(homedir(), 'ggml-silero-v6.2.0.bin')

// YYYY-MM-DD-HH-mm-SS
const operationId = new Date().toISOString().slice(0, 19).replaceAll(/\D/g, '-')
const operationPath = join('/tmp/talkie', operationId)
await mkdir(operationPath, { recursive: true })

const operationIds = await readdir('/tmp/talkie')
for (const operationId of operationIds.sort().slice(0, -MAX_OLD_OPERATIONS)) {
  await rm(join('/tmp/talkie', operationId), { recursive: true, force: true })
}

// Sox
const recordingPath = join(operationPath, 'recording.wav')
const sox = execAsync(
  `sox \
    --default-device \
    --rate 16000 \
    --channels 1 \
    --type wav \
    "${recordingPath}"`,
)
process.once('SIGINT', () => sox.child.kill('SIGINT'))
await sox.catch(() => {})
await exitIfEmpty(recordingPath)

// Whisper
const transcriptionPath = join(operationPath, 'transcription.txt')
const whisper = execAsync(
  `whisper-cli \
    --model "${WHISPER_MODEL_PATH}" \
    --file "${recordingPath}" \
    --no-prints \
    --no-timestamps \
    --language auto \
    -sns \
    --vad \
    -vm "${WHISPER_VAD_MODEL_PATH}" \
    > "${transcriptionPath}"`,
)
process.once('SIGINT', () => whisper.child.kill('SIGINT'))
await whisper.catch(() => {})
await exitIfEmpty(transcriptionPath)

console.log(readFileSync(transcriptionPath, 'utf8').trim())

export {}
