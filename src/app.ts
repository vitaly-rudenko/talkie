import { spawn } from 'node:child_process'
import { mkdir, open, readdir, readFile, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const exitIfEmpty = async (path: string) => {
  const stats = await stat(path).catch(() => null)
  if (!stats || stats.size === 0) process.exit(0)
}

const MAX_OLD_OPERATIONS = Number(process.env.TALKIE_MAX_OLD_OPERATIONS || 5)
const WHISPER_MODEL_PATH = process.env.TALKIE_WHISPER_MODEL_PATH || join(homedir(), 'ggml-large-v3-turbo-q5_0.bin')
const WHISPER_VAD_MODEL_PATH = process.env.TALKIE_WHISPER_VAD_MODEL_PATH || join(homedir(), 'ggml-silero-v6.2.0.bin')

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
const sox = spawn(
  'sox',
  [
    //
    '--default-device',
    ['--rate', '16000'],
    ['--channels', '1'],
    ['--type', 'wav'],
    recordingPath,
  ].flat(),
)
process.once('SIGINT', () => sox.kill('SIGINT'))
await new Promise(r => sox.on('exit', r))
await exitIfEmpty(recordingPath)

// Whisper
const transcriptionPath = join(operationPath, 'transcription.txt')
const transcriptionFileHandle = await open(transcriptionPath, 'w')
const whisper = spawn(
  'whisper-cli',
  [
    //
    ['--model', WHISPER_MODEL_PATH],
    ['--file', recordingPath],
    '--no-prints',
    '--no-timestamps',
    ['--language', 'auto'],
    '-sns',
    '--vad',
    ['-vm', WHISPER_VAD_MODEL_PATH],
  ].flat(),
  { stdio: ['ignore', transcriptionFileHandle.fd, 'ignore'] },
)
process.once('SIGINT', () => whisper.kill('SIGINT'))
await new Promise(r => whisper.on('exit', r))
await transcriptionFileHandle.close()
await exitIfEmpty(transcriptionPath)

console.log((await readFile(transcriptionPath, 'utf8')).trim())

export {}
