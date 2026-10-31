import { runTests } from './run-tests.mjs'

const install = process.argv.includes('--install')
process.exitCode = await runTests(install ? 'install' : 'e2e', install ? [] : process.argv.slice(2))
