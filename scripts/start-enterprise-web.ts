/** Start the source enterprise Web profile with explicit local-loopback transport permission. */
export {}

process.env.DSH_ENTERPRISE_ALLOW_LOOPBACK_HTTP = 'true'
process.argv.splice(2, 0, 'enterprise-web')

const { runCli } = await import('../apps/cli/src/bin.ts')
await runCli()
