const EMOTICON_LOOKUP = new Map([
  [':)','🙂'], [':D','😄'], [':>','😊'], [';)','😉'], ['8)','😎'], ['8D','😬'], ['o:)','😇'], ['O:)','😇'], ['>:)','😈'],
  [":')",'😂'], [":'D",'🤣'], ['xD','😆'], ['XD','😆'], [':p','😛'], [':P','😛'], [';p','😜'], [';P','😜'],
  ['xp','😝'], ['xP','😝'], ['XP','😝'], [':j','😏'], [':3','😽'], [':*','😚'], [':x','😘'], [':X','😘'],
  [':|','😐'], [':/','😕'], [':?','😒'], [':<','😓'], [':z','🤐'], [':Z','🤐'], [':(','🙁'], [':s','😧'], [':S','😧'],
  ['x(','😖'], ['X(','😖'], [":'(",'😢'], [":'o",'😭'], ['D:','😩'], ['Dx','😱'], ['>:/','😡'], ['>:(','👿'],
  [':c','😫'], [':C','😫'], [':&','🥴'], [':l','🤔'], [':L','🤔'], [':o','😲'], [':O','😲'], ['xo','😵'], ['XO','😵'],
  [':@','🤬'], ['%(','🤢'], [':$','😳'], [':#','😶'], [':B','🤓'], ['<3','❤️'], ['</3','💔'], ['\\m/','🤘']
]);

function normalize(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ');
}

function levenshteinAtMostOne(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return true;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else { i += 1; j += 1; }
  }
  if (i < a.length || j < b.length) edits += 1;
  return edits <= 1;
}

function fuzzyTokenMatch(searchText, q) {
  if (!q || q.length < 5) return false;
  return searchText.split(/\s+/).some(token => token.length >= 4 && levenshteinAtMostOne(token, q));
}

function installEmojiSearch(dialog) {
  const grid = dialog.querySelector('#spaceEmojiGrid');
  if (!grid || dialog.querySelector('.space-emoji-search')) return;

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'space-emoji-search';
  input.placeholder = 'Search emoji, country, alias or :-)';
  input.autocomplete = 'off';
  input.spellcheck = false;
  grid.before(input);

  const filter = () => {
    const raw = input.value.trim();
    const q = normalize(raw);
    const emoticonTarget = EMOTICON_LOOKUP.get(raw) || EMOTICON_LOOKUP.get(raw.replace(/=/g, ':')) || '';
    let visible = 0;

    for (const button of grid.querySelectorAll('.space-emoji-choice')) {
      const emoji = button.textContent || '';
      const searchText = normalize(button.dataset.search || button.title || emoji);
      const codepoints = [...emoji].map(char => char.codePointAt(0).toString(16)).join(' ');
      const match = !q ||
        emoji.includes(raw) ||
        searchText.includes(q) ||
        codepoints.includes(q) ||
        fuzzyTokenMatch(searchText, q) ||
        (emoticonTarget && emoji === emoticonTarget);
      button.hidden = !match;
      if (match) visible += 1;
    }

    let empty = dialog.querySelector('.space-emoji-empty');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'space-emoji-empty';
      empty.textContent = 'No matching emoji';
      grid.after(empty);
    }
    empty.hidden = visible !== 0;
  };

  input.addEventListener('input', filter);
  filter();
}

function enhanceOpenSpaceDialog() {
  const dialog = document.querySelector('.space-dialog[open]');
  if (!dialog) return;
  installEmojiSearch(dialog);
}

const observer = new MutationObserver(() => queueMicrotask(enhanceOpenSpaceDialog));
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });

document.addEventListener('contextmenu', () => setTimeout(enhanceOpenSpaceDialog, 30), true);
document.addEventListener('click', () => setTimeout(enhanceOpenSpaceDialog, 30), true);
enhanceOpenSpaceDialog();
