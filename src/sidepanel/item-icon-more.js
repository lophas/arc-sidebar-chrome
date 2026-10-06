const EXTRA_ICON_PRESETS = [
  '✅','❌','⚠️','❗','❓','➕','➖','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪',
  '📌','📍','🔖','🏷️','📂','📁','🗂️','🗃️','🗄️','📝','📄','📊','📈','📉','💾','💿','🗄️',
  '⚙️','🛠️','🔩','🔌','🔋','🖱️','⌨️','💻','🖥️','📱','📡','🌍','🌎','🌏','🛰️','☁️',
  '🔒','🔐','🔑','🛡️','👤','👥','💬','📨','📩','✉️','☎️','📞','🔔','🔕',
  '💰','💳','🏦','🧾','🛒','📦','🚚','🏢','🏭','🏥','🏫','🏛️','🗺️','🚦','⛽',
  '▶️','⏯️','🎧','🎤','🎨','🎮','🏆','⚽','🏀','🍽️','☕','🌤️','🌙','🔥','⚡'
];

function enhanceIconPicker() {
  const field = document.querySelector('.item-icon-field');
  if (!field) return;

  const input = field.querySelector('#itemIcon');
  const grid = field.querySelector('.item-icon-grid');
  if (!input || !grid) return;

  input.maxLength = 32;
  input.placeholder = 'Any emoji or short symbol';

  if (!field.querySelector('.item-icon-help')) {
    const help = document.createElement('div');
    help.className = 'item-icon-help';
    help.textContent = 'Type or paste any emoji/symbol, or choose a preset below.';
    grid.before(help);
  }

  if (grid.dataset.expanded === '1') return;
  grid.dataset.expanded = '1';

  const existing = new Set([...grid.querySelectorAll('.item-icon-choice')].map(button => button.textContent));
  for (const icon of EXTRA_ICON_PRESETS) {
    if (existing.has(icon)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'item-icon-choice';
    button.textContent = icon;
    button.title = `Use ${icon}`;
    button.addEventListener('click', () => {
      input.value = icon;
      input.focus();
    });
    grid.append(button);
  }
}

const observer = new MutationObserver(() => queueMicrotask(enhanceIconPicker));
observer.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener('click', () => queueMicrotask(enhanceIconPicker), true);
document.addEventListener('contextmenu', () => queueMicrotask(enhanceIconPicker), true);
enhanceIconPicker();
