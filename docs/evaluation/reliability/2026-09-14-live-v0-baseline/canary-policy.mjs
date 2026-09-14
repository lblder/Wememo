// External operator policy authorized on 2026-09-14. No model/runtime acceptance changes.
export const CANARY_POLICY = Object.freeze({
  version: 'v0-operator-infra-gate-2026-09-14',
  hardHttpStatuses: [400, 401, 402, 422],
  transientHttpStatuses: [429, 500, 503],
  consecutiveProviderFailureLimit: 3,
  rollingRunWindow: 8,
  failedRunsInWindowLimit: 4,
  modelOutputFailuresDoNotStop: true,
  automaticRetries: 0
})
export function assessInfrastructure(rows) {
  const diagnostics = rows.flatMap(row => row.providerDiagnostics)
  const failures = diagnostics.filter(item => item.outcome === 'failure')
  const hardHttp = failures.filter(item => CANARY_POLICY.hardHttpStatuses.includes(item.httpStatus))
  const unexplained = failures.filter(item => !CANARY_POLICY.hardHttpStatuses.includes(item.httpStatus) &&
    !(item.kind === 'http' && CANARY_POLICY.transientHttpStatuses.includes(item.httpStatus)) &&
    !['network', 'timeout', 'cancelled'].includes(item.kind))
  const classificationValid = rows.every(row => {
    const diag = row.providerDiagnostics
    const passes = diag.filter(item => item.outcome === 'success').length
    return diag.length === row.modelCalls && passes === row.providerResponses &&
      row.providerPass === (row.modelCalls ? passes === row.modelCalls : null) &&
      (row.endToEndPass ? row.failureCode === null : row.failureCode !== null && !['observation_mismatch', 'runtime_rejection'].includes(row.failureCode))
  })
  let consecutive = 0; let maxConsecutive = 0
  for (const item of diagnostics) {
    consecutive = item.outcome === 'failure' ? consecutive + 1 : 0
    maxConsecutive = Math.max(consecutive, maxConsecutive)
  }
  const recent = rows.slice(-CANARY_POLICY.rollingRunWindow)
  const recentFailedRuns = recent.filter(row => row.providerPass === false).length
  const persistent = maxConsecutive >= CANARY_POLICY.consecutiveProviderFailureLimit ||
    (recent.length === CANARY_POLICY.rollingRunWindow && recentFailedRuns >= CANARY_POLICY.failedRunsInWindowLimit)
  const stop = hardHttp.length > 0 || unexplained.length > 0 || !classificationValid || persistent
  return { stop, classificationValid, hardHttpCount: hardHttp.length, unexplainedCount: unexplained.length,
    providerFailureCount: failures.length, maxConsecutiveProviderFailures: maxConsecutive, recentFailedRuns,
    persistentInfrastructureFailure: persistent,
    diagnosticCodes: failures.map(item => item.safeMessage),
    reason: hardHttp.length ? 'http-configuration-or-protocol' : unexplained.length ? 'unexplained-provider-failure'
      : !classificationValid ? 'classification-invariant' : persistent ? 'persistent-infrastructure-failure' : null }
}
