document.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;

  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.matches('textarea,[contenteditable="true"]')) return;

  const dialog = target.closest('dialog[open]');
  if (!dialog) return;

  const saveButton = dialog.querySelector('#itemSave, #folderSave, .dialog-actions .primary');
  if (!(saveButton instanceof HTMLButtonElement) || saveButton.disabled) return;

  event.preventDefault();
  event.stopPropagation();
  saveButton.click();
});
