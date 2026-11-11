// Resolve the first comment without recursively walking the JavaScript stack.
// Edges include moderated ancestors, but never their content or author details.
export function replyRootResolver(edges: { id: string; parentId: string | null }[]) {
  const parents = new Map(edges.map((edge) => [edge.id, edge.parentId]))
  const roots = new Map<string, string>()
  return (id: string) => {
    const path: string[] = [],
      seen = new Set<string>()
    let current = id
    while (parents.get(current) && !roots.has(current) && !seen.has(current)) {
      seen.add(current)
      path.push(current)
      current = parents.get(current)!
    }
    const root =
      roots.get(current) || (seen.has(current) ? path.slice(path.indexOf(current)).sort()[0]! : current)
    for (const item of path) roots.set(item, root)
    return root
  }
}
