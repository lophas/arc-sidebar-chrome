export function groupOpenTabs(tabs, groups) {
  const metadata = new Map(groups.map(group => [group.id, group]));
  const sections = new Map();
  for (const tab of [...tabs].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
    const id = tab.groupId >= 0 ? tab.groupId : -1;
    if (!sections.has(id)) sections.set(id, { id, title: id < 0 ? 'Ungrouped' : metadata.get(id)?.title || 'Unnamed group', color: metadata.get(id)?.color || 'grey', tabs: [] });
    sections.get(id).tabs.push(tab);
  }
  return [...sections.values()];
}
