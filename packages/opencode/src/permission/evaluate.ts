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

  // Last matching rule wins. This allows specific rules to override earlier
  // general ones in either direction, e.g.:
  //   { "*": "deny", general: "allow" }  → general is allowed
  //   { general: "allow", "*": "deny" }  → general is denied (deny comes last)
  // Safety checks (Safety.check) run separately and cannot be overridden.
  const last = matching[matching.length - 1]!
  return last
}
