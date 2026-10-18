// A new command name lets Chrome register the new default independently of
// the retired Command/Ctrl+K assignment.
export const SEARCH_COMMAND = 'arc-command-bar-v4';

export async function getSearchShortcut(commands = globalThis.chrome?.commands) {
  try {
    const registered = await commands?.getAll();
    return registered?.find(command => command.name === SEARCH_COMMAND)?.shortcut || '';
  } catch {
    return '';
  }
}

export function isDefaultSearchShortcut(event, shortcut) {
  return /^(?:Alt\+K|Option\+K|⌥K)$/i.test(shortcut || '') &&
    event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
    !event.isComposing && !event.repeat && event.code === 'KeyK';
}
