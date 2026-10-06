const EMOJI_KEYWORDS = new Map(Object.entries({
  '😀':'grinning face smile happy', '😃':'grinning face big eyes smile happy', '😄':'grinning face smiling eyes smile happy :D',
  '😁':'beaming face smiling eyes grin', '😆':'squinting face laugh laughing xD XD', '😅':'grinning face sweat nervous laugh',
  '😂':'face tears joy laugh crying laughing :\')', '🤣':'rolling floor laughing rofl laugh :\'D', '🙂':'slightly smiling face smile happy :)',
  '🙃':'upside down face', '😉':'winking face wink ;)', '😊':'smiling face smiling eyes blush :>', '😇':'smiling face halo angel o:) O:)',
  '🥰':'smiling face hearts love', '😍':'heart eyes love', '🤩':'star struck stars eyes', '😘':'face blowing kiss kiss :x :X',
  '😗':'kissing face', '☺️':'smiling face smile', '😚':'kissing face closed eyes :*', '😙':'kissing face smiling eyes',
  '😋':'face savoring food yummy', '😛':'face tongue playful :p :P', '😜':'winking face tongue ;p ;P', '🤪':'zany face crazy',
  '😝':'squinting face tongue xp xP XP', '🤑':'money mouth face rich', '🤗':'hugging face hug', '🤭':'face hand mouth giggle',
  '🤫':'shushing face quiet', '🤔':'thinking face think :l :L', '🤐':'zipper mouth face quiet :z :Z', '🤨':'raised eyebrow skeptical',
  '😐':'neutral face :|', '😑':'expressionless face', '😶':'face without mouth :#', '😏':'smirking face smirk :j',
  '😒':'unamused face :?', '🙄':'face rolling eyes', '😬':'grimacing face 8D', '🤥':'lying face liar pinocchio',
  '😌':'relieved face', '😔':'pensive face sad', '😪':'sleepy face', '🤤':'drooling face', '😴':'sleeping face sleep',
  '😷':'face medical mask sick', '🤒':'face thermometer sick fever', '🤕':'face head bandage hurt', '🤢':'nauseated face sick %(',
  '🤮':'face vomiting sick', '🤧':'sneezing face sick', '🥵':'hot face heat', '🥶':'cold face freezing', '🥴':'woozy face :&',
  '😵':'dizzy face xo XO', '🤯':'exploding head mind blown', '🤠':'cowboy hat face', '🥳':'partying face party birthday',
  '😎':'smiling face sunglasses cool 8)', '🤓':'nerd face glasses :B', '🧐':'face monocle', '😕':'confused face :/',
  '😟':'worried face', '🙁':'frowning face sad :(', '☹️':'frowning face sad', '😮':'face open mouth surprised', '😯':'hushed face',
  '😲':'astonished face surprised :o :O', '😳':'flushed face embarrassed :$', '🥺':'pleading face puppy eyes', '😦':'frowning face open mouth',
  '😧':'anguished face :s :S', '😨':'fearful face', '😰':'anxious face sweat', '😥':'sad relieved face', '😢':'crying face sad :\'(',
  '😭':'loudly crying face sad :\'o', '😱':'face screaming fear Dx', '😖':'confounded face x( X(', '😣':'persevering face',
  '😞':'disappointed face sad', '😓':'downcast face sweat :<', '😩':'weary face D:', '😫':'tired face :c :C', '😤':'steam nose angry triumph',
  '😡':'pouting face angry >:/', '😠':'angry face', '🤬':'face symbols mouth swearing :@', '😈':'smiling face horns devil >:)',
  '👿':'angry face horns devil >:(', '💀':'skull death', '☠️':'skull crossbones death pirate', '💩':'pile poo poop',
  '🤡':'clown face', '👹':'ogre >0)', '👺':'goblin', '👻':'ghost halloween', '👽':'alien', '👾':'alien monster game', '🤖':'robot',
  '😺':'grinning cat', '😸':'grinning cat smiling eyes', '😹':'cat tears joy laugh', '😻':'smiling cat heart eyes', '😼':'cat wry smile',
  '😽':'kissing cat closed eyes :3', '🙀':'weary cat surprised', '😿':'crying cat', '😾':'pouting cat angry',
  '❤️':'red heart love <3', '❤':'red heart love <3', '🧡':'orange heart love', '💛':'yellow heart love', '💚':'green heart love',
  '💙':'blue heart love', '💜':'purple heart love', '🖤':'black heart love', '🤍':'white heart love', '🤎':'brown heart love',
  '💔':'broken heart heartbreak </3', '❣️':'heart exclamation love', '💕':'two hearts love', '💞':'revolving hearts love', '💓':'beating heart love',
  '💗':'growing heart love', '💖':'sparkling heart love', '💘':'heart arrow cupid love', '💝':'heart ribbon gift love',
  '👍':'thumbs up like yes good', '👎':'thumbs down dislike no bad', '👌':'ok hand good', '✌️':'victory hand peace', '🤞':'crossed fingers luck',
  '🤟':'love you gesture', '🤘':'sign horns rock \\m/', '🤙':'call me hand phone', '👋':'waving hand hello bye', '👏':'clapping hands applause',
  '🙌':'raising hands celebration', '👐':'open hands', '🤲':'palms up together', '🙏':'folded hands pray thanks please', '💪':'flexed biceps strong muscle',
  '🧠':'brain mind', '👀':'eyes look watch', '👁️':'eye', '👂':'ear listen', '👃':'nose', '👄':'mouth lips',
  '👤':'person silhouette user profile', '👥':'people silhouettes users group', '👶':'baby child', '🧒':'child', '👦':'boy', '👧':'girl',
  '🧑':'person adult', '👨':'man male', '👩':'woman female', '🧓':'older person', '👴':'old man', '👵':'old woman',
  '👨‍💻':'man technologist developer computer coder', '👩‍💻':'woman technologist developer computer coder', '🧑‍💻':'technologist developer computer coder',
  '👨‍🔧':'man mechanic repair', '👩‍🔧':'woman mechanic repair', '🧑‍🔧':'mechanic repair',
  '👨‍🏫':'man teacher school', '👩‍🏫':'woman teacher school', '🧑‍🏫':'teacher school',
  '👨‍⚕️':'man health worker doctor', '👩‍⚕️':'woman health worker doctor', '🧑‍⚕️':'health worker doctor',
  '👨‍🍳':'man cook chef', '👩‍🍳':'woman cook chef', '🧑‍🍳':'cook chef', '👨‍🎨':'man artist art', '👩‍🎨':'woman artist art',
  '🧑‍🎨':'artist art', '👨‍🚀':'man astronaut space', '👩‍🚀':'woman astronaut space', '🧑‍🚀':'astronaut space',
  '🏠':'house home', '🏡':'house garden home', '🏢':'office building business work', '🏭':'factory industry', '🏥':'hospital health', '🏫':'school education',
  '🏛️':'classical building government museum', '🏦':'bank finance money', '🏪':'convenience store shop', '🏬':'department store shopping',
  '💼':'briefcase business work office', '🛒':'shopping cart trolley shop', '🛍️':'shopping bags shop', '💰':'money bag finance dollar',
  '💵':'dollar banknote money', '💶':'euro banknote money', '💳':'credit card payment', '🧾':'receipt invoice',
  '📁':'file folder directory', '📂':'open file folder directory', '🗂️':'card index dividers files', '📄':'page document file', '📝':'memo note edit',
  '📌':'pushpin pin', '📍':'round pushpin location', '🔖':'bookmark', '🏷️':'label tag',
  '💻':'laptop computer', '🖥️':'desktop computer monitor', '⌨️':'keyboard', '🖱️':'mouse computer', '📱':'mobile phone smartphone',
  '☎️':'telephone phone', '📞':'telephone receiver call phone', '📡':'satellite antenna network', '🛰️':'satellite space network', '🌐':'globe meridians web internet',
  '☁️':'cloud', '⚙️':'gear settings configuration', '🔧':'wrench tool settings repair', '🛠️':'hammer wrench tools repair', '🧰':'toolbox tools',
  '🔌':'electric plug power', '🔋':'battery power', '💡':'light bulb idea', '🔒':'locked lock security', '🔓':'unlocked lock security', '🔑':'key password',
  '🛡️':'shield security', '🧪':'test tube experiment lab', '🔬':'microscope science',
  '✉️':'envelope email mail', '📧':'email e-mail', '📨':'incoming envelope mail', '📩':'envelope arrow mail', '💬':'speech balloon chat message',
  '💭':'thought balloon', '🔔':'bell notification', '🔕':'bell slash mute notification',
  '📅':'calendar date', '📆':'tear off calendar date', '⏰':'alarm clock time', '⌚':'watch time', '⏱️':'stopwatch timer', '⏲️':'timer clock',
  '⭐':'star favorite', '🌟':'glowing star favorite', '✨':'sparkles magic', '🔥':'fire hot', '⚡':'high voltage lightning electric',
  '☀️':'sun sunny weather', '🌤️':'sun behind cloud weather', '🌧️':'cloud rain weather', '❄️':'snowflake cold weather', '🌙':'crescent moon night',
  '🌍':'globe europe africa earth world', '🌎':'globe americas earth world', '🌏':'globe asia australia earth world',
  '✈️':'airplane plane flight travel', '🚗':'car automobile vehicle', '🚕':'taxi car', '🚌':'bus', '🚆':'train railway', '🚲':'bicycle bike',
  '🚀':'rocket space launch', '⛽':'fuel pump gas petrol', '🚦':'traffic light', '🗺️':'map travel', '🧭':'compass navigation',
  '🎬':'clapper board movie film cinema', '📺':'television tv', '📷':'camera photo', '🎵':'musical note music', '🎶':'musical notes music',
  '🎧':'headphone music audio', '🎤':'microphone music voice', '🎮':'video game controller gaming', '🏆':'trophy winner award',
  '⚽':'soccer football ball', '🏀':'basketball ball', '☕':'hot beverage coffee tea', '🍽️':'plate fork knife food meal', '🍕':'pizza food',
  '📰':'newspaper news', '📚':'books library reading', '📖':'open book reading', '✏️':'pencil write edit', '🖊️':'pen write edit',
  '✅':'check mark yes done success', '❌':'cross mark x no cancel error', '⚠️':'warning caution', '❗':'exclamation mark important', '❓':'question mark help',
  '➕':'plus add', '➖':'minus remove', '🔴':'red circle', '🟠':'orange circle', '🟡':'yellow circle', '🟢':'green circle', '🔵':'blue circle',
  '🟣':'purple circle', '⚫':'black circle', '⚪':'white circle', '🏳️‍🌈':'rainbow flag pride', '🏳️‍⚧️':'transgender flag', '🏴‍☠️':'pirate flag'
}));

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
  return String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
}

function installEmojiSearch(dialog) {
  const grid = dialog.querySelector('#spaceEmojiGrid');
  if (!grid || dialog.querySelector('.space-emoji-search')) return;

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'space-emoji-search';
  input.placeholder = 'Search emoji by name, alias or :-)';
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
      const keywords = normalize(EMOJI_KEYWORDS.get(emoji) || '');
      const cp = [...emoji].map(char => char.codePointAt(0).toString(16)).join(' ');
      const match = !q || emoji.includes(raw) || keywords.includes(q) || cp.includes(q) || (emoticonTarget && emoji === emoticonTarget);
      button.hidden = !match;
      if (match) visible += 1;
    }

    grid.classList.toggle('no-results', visible === 0);
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
