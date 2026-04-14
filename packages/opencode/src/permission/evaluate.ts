import { Wildcard } from "@/util/wildcard"

type Rule = {
  permission: string
  pattern: string
  action: "allow" | "deny" | "ask"
}

export function evaluate(permission: string, pattern: string, ...rulesets: Rule[][]): Rule {
  const rules = rulesets.flat()
  const matching = rules.filter(
    (rule) => Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern),
  )
  if (matching.length === 0) return { action: "ask", permission, pattern: "*" }

  // deny rules always win regardless of order
  const denied = matching.findLast((rule) => rule.action === "deny")
  if (denied) return denied

  // for ask vs allow, last matching rule wins (preserves intentional specificity
  // overrides like *.env.example: allow after *.env.*: ask)
  const last = matching[matching.length - 1]!
  return last
}
