/** Asks for a new name; null when cancelled or unchanged. */
export function rename(current) {
  const name = window.prompt('New name', current);
  return name && name.trim() !== current ? name.trim() : null;
}
