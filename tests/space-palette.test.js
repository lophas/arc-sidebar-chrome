import test from 'node:test';
import assert from 'node:assert/strict';
import {SPACE_PALETTES,withSpacePalettes,nextSpacePalette,normalizeSpacePalette,paletteColors,paletteGroupColor,paletteStyle} from '../src/shared/space-palette.js';
import {hasSyncContent} from '../src/shared/sync-content.js';
import {mergeChange} from '../src/shared/state-merge.js';
test('legacy Spaces default to Classic and keep saved palettes without losing imported or saved metadata',()=>{
 const old={favorites:[{id:'fav',icon:'image'}],spaces:[{id:'a',title:'Work',icon:'image',color:'old-arc-color',children:[{id:'folder',type:'folder',children:[{id:'pin',url:'https://a.test'}]}]},{id:'b',title:'Home',children:[],palette:{kind:'preset',id:'green'}}]};
 const copy=structuredClone(old),upgraded=withSpacePalettes(old);
 assert.deepEqual(old,copy);assert.deepEqual(upgraded.spaces.map(space=>space.palette),[{kind:'preset',id:'black'},{kind:'preset',id:'green'}]);
 assert.deepEqual(upgraded.spaces[0].children,old.spaces[0].children);assert.equal(upgraded.spaces[0].icon,'image');assert.equal(upgraded.spaces[0].color,'old-arc-color');
 assert.equal(withSpacePalettes(upgraded),upgraded);
 const reordered={...upgraded,spaces:[...upgraded.spaces].reverse()};assert.equal(withSpacePalettes(reordered),reordered);assert.equal(reordered.spaces[0].palette.id,'green');
 assert.deepEqual(nextSpacePalette(upgraded.spaces),{kind:'preset',id:'black'});
 assert.equal(nextSpacePalette([{palette:{kind:'solid',colors:['#073c99']}},{palette:{kind:'solid',colors:['#00aa66']}}]).id,'black');
});
test('solid/gradient colors normalize safely and reject arbitrary CSS or incomplete colors',()=>{
 assert.deepEqual(normalizeSpacePalette({kind:'gradient',colors:['#ABC','#001122']}),{kind:'gradient',colors:['#aabbcc','#001122']});
 for(const value of [{kind:'preset',id:'bad'},{kind:'solid',colors:['url(https://evil.test)']},{kind:'gradient',colors:['#ffffff']},{kind:'solid',colors:['red']},{kind:'solid',colors:['#ffffff','#000000']}])assert.equal(normalizeSpacePalette(value),null);
 assert.equal(withSpacePalettes({spaces:[{id:'broken',palette:{kind:'solid',colors:['invalid']}}]}).spaces[0].palette.id,'black');
});
test('storage field ordering does not cause palette rewrites or turn the automatic default into Sync content',()=>{
 for(const palette of [{kind:'preset',id:'black'},{id:'black',kind:'preset'},{kind:'preset',id:'blue'},{id:'blue',kind:'preset'},{kind:'gradient',colors:['#073c99','#ff8800']},{colors:['#073c99','#ff8800'],kind:'gradient'}]){
  const model={spaces:[{id:'a',palette}]};assert.equal(withSpacePalettes(model),model);
 }
 for(const id of ['black','blue']){const model={favorites:[],spaces:[{id:'__my_space__',title:'My Space',emoji:'🚀',children:[],palette:{id,kind:'preset'}}]};assert.equal(hasSyncContent(model),false);}
});
test('each preset matches its Chrome group; custom colors use primary hue and neutral shades use grey',()=>{
 for(const palette of SPACE_PALETTES)assert.equal(paletteGroupColor({kind:'preset',id:palette.id}),palette.id==='black'?'grey':palette.id);
 for(const [color,expected]of [['#073c99','blue'],['#ff0000','red'],['#00aa66','green'],['#ffff00','yellow'],['#00ffff','cyan'],['#aa00ff','purple'],['#ff8800','orange'],['#ff0080','pink'],['#222222','grey'],['#ffffff','grey']])assert.equal(paletteGroupColor({kind:'solid',colors:[color]}),expected,color);
 assert.equal(paletteGroupColor({kind:'gradient',colors:['#073c99','#ff8800']}),'blue');
});
const luminance=color=>{
 const channels=[1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16)/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);
 return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
};
const contrast=(a,b)=>{const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(values[0]+0.05)/(values[1]+0.05);};
test('light and dark palettes keep primary/muted text readable at every gradient endpoint and on panels',()=>{
 const colors=['#000000','#ffffff','#ff0000','#00ff00','#0000ff','#ffff00','#00ffff','#ff00ff'];
 const palettes=[...SPACE_PALETTES.map(p=>({kind:'preset',id:p.id})),...colors.map(color=>({kind:'gradient',colors:[color,'#ffffff']}))];
 for(const palette of palettes)for(const dark of [false,true]){
  const style=paletteStyle(palette,dark),backgrounds=[...(style['--space-background'].match(/#[0-9a-f]{6}/g)||[]),style['--panel']];
  for(const background of backgrounds)for(const text of ['--text','--muted'])assert.ok(contrast(style[text],background)>=4.5,JSON.stringify({palette,dark,text,background}));
 }
});
test('backup JSON and concurrent model edits preserve palette settings, icons and folder content',()=>{
 const before=withSpacePalettes({favorites:[],spaces:[{id:'a',title:'Work',children:[],icon:'custom'}]});
 const edited=structuredClone(before);edited.spaces[0].palette={kind:'gradient',colors:['#073c99','#ff8800']};
 const latest=structuredClone(before);latest.spaces[0].title='New title';latest.spaces[0].children.push({id:'pin',type:'tab',url:'https://a.test'});
 const merged=mergeChange(latest,before,edited);assert.equal(merged.spaces[0].title,'New title');assert.equal(merged.spaces[0].children.length,1);
 const restored=withSpacePalettes(JSON.parse(JSON.stringify({format:'arc-sidebar-backup',version:2,model:merged})).model);
 assert.deepEqual(restored,merged);assert.deepEqual(paletteColors(restored.spaces[0].palette),['#073c99','#ff8800']);
});
test('automatic My Space palette cannot upload an empty profile; an intentional palette customization can sync',()=>{
 const empty=withSpacePalettes({favorites:[],spaces:[{id:'__my_space__',title:'My Space',emoji:'🚀',children:[]}]});assert.equal(hasSyncContent(empty),false);
 empty.spaces[0].palette={kind:'preset',id:'green'};assert.equal(hasSyncContent(empty),true);
});
