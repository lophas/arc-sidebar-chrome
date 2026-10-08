export const FAVORITES_SPACE_ID = '__favorites__';

// Shared destination picker for all sidebar editors.
export function fillSpaceSelect(select, spaces, { selectedId, allowFavorites = true } = {}) {
  select.replaceChildren();
  const favorite = document.createElement('option');
  favorite.value = FAVORITES_SPACE_ID;
  favorite.textContent = '★ Favorites';
  favorite.disabled = !allowFavorites;
  if (!allowFavorites) favorite.title = 'Favorites contains links only';
  select.append(favorite);
  for (const space of spaces || []) {
    const option = document.createElement('option');
    option.value = space.id;
    option.textContent = `${space.emoji || space.title?.slice(0, 1).toUpperCase() || '•'} ${space.title || 'Untitled Space'}`;
    select.append(option);
  }
  select.value = (allowFavorites && selectedId === FAVORITES_SPACE_ID) || spaces?.some(space => space.id === selectedId)
    ? selectedId : spaces?.[0]?.id || (allowFavorites ? FAVORITES_SPACE_ID : '');
}
