#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdir, open, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** @param {string} path */
const exitIfEmpty = async path => {
  const stats = await stat(path).catch(() => null)
  if (!stats || stats.size === 0) process.exit(0)
}

const WHISPER_MODEL_PATH = process.env.TALKIE_WHISPER_MODEL_PATH
if (!WHISPER_MODEL_PATH) throw new Error('TALKIE_WHISPER_MODEL_PATH is not set')

const WHISPER_VAD_MODEL_PATH = process.env.TALKIE_WHISPER_VAD_MODEL_PATH
const LANGUAGE = process.env.TALKIE_LANGUAGE

// YYYY-MM-DD-HH-mm-SS
const operationId = new Date().toISOString().slice(0, 19).replaceAll(/\D/g, '-')
const operationPath = join('/tmp/talkie', operationId)
await mkdir(operationPath, { recursive: true })

try {
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
      ['--language', LANGUAGE || 'auto'],
      '-sns',
      ...(WHISPER_VAD_MODEL_PATH
        ? [
            //
            '--vad',
            ['-vm', WHISPER_VAD_MODEL_PATH],
          ]
        : []),
    ].flat(),
    { stdio: ['ignore', transcriptionFileHandle.fd, 'ignore'] },
  )
  process.once('SIGINT', () => whisper.kill('SIGINT'))
  await new Promise(r => whisper.on('exit', r))
  await transcriptionFileHandle.close()
  await exitIfEmpty(transcriptionPath)

  console.log((await readFile(transcriptionPath, 'utf8')).trim())
} finally {
  await rm(operationPath, { recursive: true, force: true })
}

export {}
