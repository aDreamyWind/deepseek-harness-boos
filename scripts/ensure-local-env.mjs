#!/usr/bin/env node
import { constants, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const example = fileURLToPath(new URL('../.env.example', import.meta.url))
const target = fileURLToPath(new URL('../.env', import.meta.url))

try {
  copyFileSync(example, target, constants.COPYFILE_EXCL)
  console.log('Created .env from .env.example; fill in the Harness Admin client and model values before enterprise launch.')
} catch (error) {
  if (error?.code !== 'EEXIST') throw error
}
