export function sameWorkspacePlace(a, b) {
  return (a?.active || "") === (b?.active || "")
    && (a?.selectedFamily || null) === (b?.selectedFamily || null);
}

export function pushWorkspacePlace(stack = [], current, next) {
  if (sameWorkspacePlace(current, next)) return stack;
  const last = stack[stack.length - 1];
  if (sameWorkspacePlace(last, current)) return stack;
  return [...stack, { active: current?.active || "Applications", selectedFamily: current?.selectedFamily || null }];
}

export function popWorkspacePlace(stack = []) {
  if (!stack.length) {
    return { stack, previous: { active: "Applications", selectedFamily: null } };
  }
  return {
    stack: stack.slice(0, -1),
    previous: stack[stack.length - 1],
  };
}

export function workspaceBackLabel({ overlay = false, previous = null, fallback = "Applications" } = {}) {
  if (overlay) return "Retour";
  if (previous?.active === "Applications" && previous.selectedFamily) return previous.selectedFamily;
  if (previous?.active && previous.active !== "Applications") return previous.active;
  return fallback;
}
