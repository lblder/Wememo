import { REASONING_DIAGNOSTICS, type ReasoningDiagnostic } from '../../shared/reasoning-diagnostic'

export function ReasoningFailureDetail({ diagnostic }: { diagnostic?: ReasoningDiagnostic }): React.JSX.Element | null {
  if (!diagnostic) return null
  const [stage, explanation] = REASONING_DIAGNOSTICS[diagnostic.kind]
  return <div className="reasoning-failure-detail">
    <p><strong>未通过：{stage}</strong></p>
    <p>{explanation}</p>
    {diagnostic.detail ? <p>字段位置：{diagnostic.detail}</p> : null}
  </div>
}
