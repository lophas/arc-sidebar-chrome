const EXTRA_SPACE_EMOJIS = [
  ['☘️','shamrock clover ireland lucky'],['🍀','four leaf clover lucky green ireland'],['🌱','seedling plant grow nature'],['🌿','herb plant green nature'],['🍃','leaf wind nature'],['🍂','fallen leaf autumn'],['🍁','maple leaf canada autumn'],['🌾','rice grain plant'],['🌺','hibiscus flower'],['🌻','sunflower flower sun'],['🌼','blossom flower'],['🌷','tulip flower'],['💐','bouquet flowers gift'],['🌊','wave water sea ocean'],['💧','droplet water'],['💦','sweat droplets water'],['☔','umbrella rain weather'],['🌞','sun face weather'],['🌝','full moon face'],['🌚','new moon face'],['🌛','moon face'],['🌜','moon face'],['🌕','full moon'],['🌑','new moon'],['🌠','shooting star'],['☄️','comet space'],['🌌','milky way galaxy space'],
  ['👨‍💼','man office worker business manager'],['👩‍💼','woman office worker business manager'],['🧑‍💼','office worker business manager'],['👨‍⚖️','man judge law'],['👩‍⚖️','woman judge law'],['🧑‍⚖️','judge law'],['👮','police officer'],['👷','construction worker'],['💂','guard'],['🕵️','detective'],['👨‍🍳','man cook chef'],['👩‍🍳','woman cook chef'],['🧑‍🍳','cook chef'],['👨‍🌾','man farmer'],['👩‍🌾','woman farmer'],['🧑‍🌾','farmer'],['👨‍🚒','man firefighter'],['👩‍🚒','woman firefighter'],['🧑‍🚒','firefighter'],['🎅','santa christmas'],['🤶','mrs claus christmas'],['👰','bride wedding'],['🤵','tuxedo wedding'],['👑','crown king queen'],['👓','glasses'],['🕶️','sunglasses'],['🎓','graduation cap school university'],
  ['✡️','star of david jewish judaism israel'],['☮️','peace symbol'],['☯️','yin yang'],['☦️','orthodox cross religion'],['✝️','latin cross christian'],['☪️','star crescent islam'],['🕎','menorah jewish judaism hanukkah'],['🔯','dotted six pointed star'],['♾️','infinity'],['⚛️','atom science'],['♻️','recycle recycling'],['⚕️','medical symbol health'],['⚖️','scales law justice'],['⚜️','fleur de lis'],
  ['🔭','telescope astronomy space'],['📻','radio audio'],['🎥','movie camera film video'],['🎦','cinema movie film'],['📹','video camera'],['📼','videocassette video'],['🎞️','film frames movie'],['📽️','film projector movie'],['📸','camera flash photo'],['🔍','magnifying glass search'],['🔎','magnifying glass search'],['🔦','flashlight torch'],['🕯️','candle light'],['🧲','magnet'],['🧯','fire extinguisher'],['🧹','broom cleaning'],['🧺','basket laundry'],['🧻','paper roll'],['🧼','soap cleaning'],['🧽','sponge cleaning'],['🪑','chair furniture'],['🚪','door'],['🛏️','bed'],['🛋️','couch sofa'],['🚿','shower'],['🛁','bathtub'],['🚽','toilet'],
  ['🗄️','file cabinet archive'],['🗃️','card file box archive'],['🗑️','trash waste bin delete'],['📦','package box shipping'],['📫','mailbox mail'],['📬','mailbox open mail'],['📮','postbox mail'],['📊','bar chart analytics stats'],['📈','chart increasing growth'],['📉','chart decreasing decline'],['💹','chart yen market'],['🧮','abacus calculate accounting'],['📏','ruler measure'],['📐','triangle ruler measure'],['📎','paperclip attachment'],['🖇️','paperclips attachment'],['✂️','scissors cut'],['🖋️','fountain pen write'],['🖌️','paintbrush art'],['🖍️','crayon art'],['📜','scroll document'],['📕','red book'],['📗','green book'],['📘','blue book'],['📙','orange book'],['📓','notebook'],['📔','notebook decorative'],['📒','ledger book'],['📃','page curl document'],['📋','clipboard'],['📇','card index contacts'],
  ['🖨️','printer'],['💾','floppy disk save'],['💿','optical disk cd'],['📀','dvd disk'],['🎛️','control knobs audio'],['🎚️','level slider audio'],['🎙️','studio microphone podcast'],['📢','loudspeaker announcement'],['📣','megaphone announcement'],['📯','postal horn'],['🔊','speaker loud sound'],['🔉','speaker medium sound'],['🔈','speaker low sound'],['🔇','mute speaker'],['🎼','music score'],['🎹','piano keyboard music'],['🎸','guitar music'],['🎻','violin music'],['🎺','trumpet music'],['🎷','saxophone music'],['🥁','drum music'],
  ['🧩','puzzle piece game'],['🎯','target bullseye goal'],['🎲','dice game'],['♟️','chess pawn game'],['🎳','bowling'],['🎱','pool billiards'],['🏓','ping pong table tennis'],['🏸','badminton'],['🏒','ice hockey'],['🏑','field hockey'],['🏏','cricket'],['🥊','boxing glove'],['🥋','martial arts'],['🎿','ski'],['⛷️','skier'],['🏂','snowboard'],['🏊','swimming'],['🚴','cycling bicycle'],['🏋️','weight lifting gym'],['🤸','gymnastics'],['🏅','medal sport'],['🥇','gold medal first'],['🥈','silver medal second'],['🥉','bronze medal third'],
  ['🚁','helicopter'],['🛩️','small airplane'],['🛫','airplane departure'],['🛬','airplane arrival'],['🛸','ufo flying saucer'],['🛥️','motor boat'],['🚤','speedboat'],['🛳️','passenger ship cruise'],['🚢','ship'],['🚂','locomotive train'],['🚄','high speed train'],['🚅','bullet train'],['🚇','metro subway'],['🚊','tram'],['🚎','trolleybus'],['🚙','suv car'],['🚓','police car'],['🚑','ambulance'],['🚒','fire engine'],['🚐','minibus van'],['🚚','delivery truck'],['🚛','lorry truck'],['🏍️','motorcycle'],['🛵','scooter'],['🚜','tractor'],['🛴','kick scooter'],['🛹','skateboard'],['🏎️','racing car'],
  ['🏰','castle'],['🏯','japanese castle'],['🗼','tower tokyo'],['🗽','statue liberty new york'],['⛪','church'],['🕌','mosque'],['🛕','hindu temple'],['🕍','synagogue jewish judaism'],['⛩️','shinto shrine'],['🕋','kaaba islam'],['⛲','fountain'],['⛺','tent camping'],['🏕️','camping'],['🏖️','beach umbrella'],['🏝️','desert island'],['🏜️','desert'],['🏔️','snow mountain'],['⛰️','mountain'],['🌋','volcano'],['🗻','mount fuji'],['🌉','bridge night'],['🌁','foggy bridge'],['🌃','city night'],['🏙️','cityscape'],['🌆','city dusk'],['🌇','sunset city'],
  ['🍏','green apple fruit'],['🍐','pear fruit'],['🍊','orange fruit'],['🍋','lemon fruit'],['🍌','banana fruit'],['🍉','watermelon fruit'],['🍇','grapes fruit'],['🍓','strawberry fruit'],['🍈','melon fruit'],['🍒','cherries fruit'],['🍑','peach fruit'],['🍍','pineapple fruit'],['🥝','kiwi fruit'],['🍅','tomato'],['🍆','eggplant'],['🥑','avocado'],['🥦','broccoli'],['🥕','carrot'],['🌽','corn'],['🌶️','hot pepper chilli'],['🥔','potato'],['🍞','bread'],['🥐','croissant'],['🥨','pretzel'],['🧀','cheese'],['🥚','egg'],['🍳','cooking egg'],['🥞','pancakes'],['🥓','bacon'],['🥩','meat steak'],['🍗','poultry chicken'],['🍖','meat bone'],['🌭','hot dog'],['🌮','taco'],['🌯','burrito'],['🥗','salad'],['🍿','popcorn movie'],['🍲','pot food'],['🍣','sushi'],['🍜','noodles ramen'],['🍰','cake dessert'],['🎂','birthday cake'],['🍪','cookie'],['🍫','chocolate'],['🍬','candy'],['🍭','lollipop'],['🍯','honey'],['🥛','milk'],['🍼','baby bottle'],['🍵','tea'],['🍷','wine'],['🍸','cocktail'],['🍹','tropical drink'],['🍻','beers cheers'],['🥂','champagne cheers'],
  ['🐶','dog animal'],['🐱','cat animal'],['🐭','mouse animal'],['🐹','hamster'],['🐰','rabbit bunny'],['🦊','fox'],['🐻','bear'],['🐼','panda'],['🐨','koala'],['🐯','tiger'],['🦁','lion'],['🐮','cow'],['🐷','pig'],['🐸','frog'],['🐵','monkey'],['🐔','chicken'],['🐧','penguin'],['🐦','bird'],['🐤','chick bird'],['🦆','duck'],['🦅','eagle'],['🦉','owl'],['🐴','horse'],['🦄','unicorn'],['🐝','bee'],['🐛','bug caterpillar'],['🦋','butterfly'],['🐌','snail'],['🐞','ladybug'],['🐜','ant'],['🕷️','spider'],['🐢','turtle'],['🐍','snake'],['🦎','lizard'],['🐙','octopus'],['🦑','squid'],['🦀','crab'],['🐠','fish'],['🐟','fish'],['🐬','dolphin'],['🐳','whale'],['🦈','shark'],
  ['🎁','gift present'],['🎈','balloon party'],['🎉','party popper celebration'],['🎊','confetti celebration'],['🎀','ribbon'],['🎄','christmas tree'],['🎃','pumpkin halloween'],['🧨','firecracker'],['🎇','sparkler'],['🎆','fireworks'],['🔮','crystal ball magic'],['🪄','magic wand'],['🎭','theater masks drama'],['🎨','artist palette art'],['🖼️','framed picture art'],['🧸','teddy bear'],['🃏','joker card'],['🀄','mahjong'],
  ['💎','gem diamond'],['💍','ring jewelry'],['⌚','watch'],['👔','necktie business'],['👕','shirt'],['👖','jeans pants'],['🧥','coat'],['👗','dress'],['👘','kimono'],['👠','high heel shoe'],['👟','running shoe'],['👞','shoe'],['🧢','cap hat'],['🎩','top hat'],['👒','hat'],['🎒','backpack school'],['👜','handbag'],['👛','purse'],['👝','clutch bag'],['💄','lipstick'],
  ['🆕','new'],['🆗','ok'],['🆘','sos emergency'],['🆙','up'],['🆒','cool'],['🆓','free'],['ℹ️','information info'],['▶️','play'],['⏸️','pause'],['⏹️','stop'],['⏺️','record'],['⏭️','next'],['⏮️','previous'],['⏩','fast forward'],['⏪','rewind'],['🔀','shuffle'],['🔁','repeat'],['🔂','repeat one'],['⬆️','up arrow'],['⬇️','down arrow'],['⬅️','left arrow'],['➡️','right arrow'],['↗️','up right arrow'],['↘️','down right arrow'],['↙️','down left arrow'],['↖️','up left arrow'],['↩️','return arrow'],['↪️','forward arrow']
];

function appendExtraEmojiChoices(dialog) {
  const grid = dialog.querySelector('#spaceEmojiGrid');
  const input = dialog.querySelector('#spaceEmoji');
  if (!grid || !input || grid.dataset.extraSafeSet === '1') return;
  if (grid.dataset.fullEmojiSet !== '1') return;

  grid.dataset.extraSafeSet = '1';
  const existing = new Set([...grid.querySelectorAll('.space-emoji-choice')].map(button => button.textContent));
  const fragment = document.createDocumentFragment();

  for (const [emoji, keywords] of EXTRA_SPACE_EMOJIS) {
    if (existing.has(emoji)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'space-emoji-choice';
    button.textContent = emoji;
    button.title = keywords.split(' ').slice(0, 6).join(' ');
    button.dataset.search = `${emoji} ${keywords}`.toLowerCase();
    button.addEventListener('click', () => {
      delete dialog.dataset.spaceFileIcon;
      input.value = emoji;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      grid.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
      button.classList.add('selected');
      const status = dialog.querySelector('.space-icon-status');
      if (status) status.textContent = '';
    });
    fragment.append(button);
  }

  grid.append(fragment);
}

function enhanceExtraEmojiSet() {
  const dialog = document.querySelector('.space-dialog[open]');
  if (!dialog) return;
  appendExtraEmojiChoices(dialog);
}

const extraEmojiObserver = new MutationObserver(() => queueMicrotask(enhanceExtraEmojiSet));
extraEmojiObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });

document.addEventListener('contextmenu', () => setTimeout(enhanceExtraEmojiSet, 40), true);
document.addEventListener('click', () => setTimeout(enhanceExtraEmojiSet, 40), true);
enhanceExtraEmojiSet();
