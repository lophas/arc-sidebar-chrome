# Arc Side of the Chrome 3.1.14 — erőforrás-audit

Dátum: 2026-10-15. Vizsgált kiadás: [v3.1.14](https://github.com/lophas/arc-sidebar-chrome/tree/v3.1.14), commit: `593f731f85e5f4b4fc66f7888b814b2ebbd53b4f`.

## Döntési javaslat

Érdemes célzottan optimalizálni. Az első javaslatnak már van mérési alátámasztása: az üres autohide iframe első használatig történő elhalasztása 50 tabnál **75–123 MiB** megtakarítást adott két kontrollált összehasonlításban. Következőként a teljes tabkötés-helyreállítás fölösleges futásait és a PiP ismételt injektálását érdemes ritkítani. Teljes architektúra-újraírást ezek az eredmények nem indokolnak.

A production forrásokat és a main ágat az audit nem módosította. A késleltetett iframe egy ideiglenes, eldobható extensionmásolatban futott; a kísérlet nem tekinthető kész, funkcionálisan jóváhagyott javításnak.

## Mérési környezet és módszer

- Linux GitHub Actions, AMD EPYC 7763, 4 virtuális CPU, kb. 16 GB RAM; Chromium **141.0.7390.37**, Playwright 1.56.1.
- Valódi MV3 extension, eredeti manifest és jogosultságok, 1280×800 viewport. Nem a felhasználó Macjén, nem valódi ChatGPT/Gmail oldalakon mértünk.
- Kontroll: extension nélküli Chrome. Összehasonlítás: alapértelmezett autohide + PiP, illetve Fixed + kikapcsolt PiP. A Fixed esetben maga a natív panel nem volt nyitva.
- 1, 20 és 50 egyszerű HTTPS-fixture tab; 200 mentett link 4 Space-ben, 8 Favorite, egyedi feltöltött ikonok nélkül. A kontroll és az autohide kétszer, a Fixed/PiP-off egyszer futott.
- A teljes Chrome-folyamatcsoport **PSS** értékét összegeztük a Linux `/proc/.../smaps_rollup` adataiból. Az RSS is megvan a nyers JSON-ban, de nem azt használtuk döntésre: megosztott memóriát többször számolhatna.
- A JavaScript heap külön CDP-mérés, a memóriaállapotok előtt kényszerített GC-vel az aktív page targeten. A page target/isolate heapjét nem összegeztük tabonként. Ez nem a teljes böngésző RAM-ja.
- A CPU az egész Chrome-folyamatcsoport számlálóiból, 250 ms-os mintavétellel származik; 100% egy teljes CPU-magot jelent. A böngésző renderelését/kompozitálását is tartalmazza. A rövid időablakok és a CI miatt kis különbségeket nem értelmezünk biztos megtakarításként.
- Az API-számlálás külön, instrumentált service workerrel futott; az ottani 20 fixture tab mellett egy Options vezérlőtab is nyitva maradt. A debugger befolyásolhatja a worker elalvását: annak 30 másodperc utáni felfüggesztéséről nem teszünk állítást.

A Chrome dokumentációja is külön kezeli az [OS-memóriát és a JavaScript heapet](https://developer.chrome.com/docs/devtools/memory-problems). A használt protokoll: [Performance](https://chromedevtools.github.io/devtools-protocol/tot/Performance/), [Runtime heap](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage).

## Memória: a kiadott verzió

Az alábbi értékek az extension **többletét** mutatják az extension nélküli böngészőhöz képest, nem a teljes Chrome méretét. 1 MiB = 1 048 576 byte.

| Fixture tabok | Autohide többlet, két páros összehasonlítás | Autohide átlagos többlet | Fixed + PiP off többlet, egy mérés |
| --- | ---: | ---: | ---: |
| 1 | 48–53 MiB | 50 MiB | 46 MiB |
| 20 | 107–144 MiB | 126 MiB | 61 MiB |
| 50 | 207–292 MiB | 250 MiB | 99 MiB |

Például 50 tabnál a kontroll teljes PSS-e 912–917 MiB, az autohide-é 1120–1209 MiB volt. Az utóbbi tehát nem mind az extension saját memóriaigénye. A két autohide-futás közötti eltérés miatt a tartomány informatívabb egyetlen pontos számnál.

Az aktív, egyszerű page target GC utáni JS heapje:

| Állapot | Heap | DOM-dokumentumok | DOM-eseménykezelők |
| --- | ---: | ---: | ---: |
| Extension nélkül | 0,59 MiB | 1 | 0 |
| Autohide + PiP | 1,48 MiB | 2 | 30 |
| Fixed + PiP kikapcsolva | 0,84 MiB | 1 | 6 |

A háttértabokon a kezdeti mérésekben **0 betöltött sidebar alkalmazás** maradt. Az autohide viszont tabonként létrehoz egy üres iframe-dokumentumot, még az első hover előtt. Ez lényeges különbség a „felület nincs betöltve” és a „még iframe sincs” állapot között.

A Fixed/PiP-off állapot sem nulla költségű: a manifest továbbra is deklarálja a content scripteket. Kevesebb DOM-ot hoznak létre, de scriptkörnyezet és eseménykezelők továbbra is létrejönnek.

## Kísérleti összehasonlítás: az üres iframe késleltetése

Az audit egy ideiglenes extensionmásolatban változtatott két dolgot: az iframe csak első megnyitáskor csatlakozott a DOM-hoz, és az alapjárati felület háttérbe kerüléskor le is csatlakozott. Minden más production forrás azonos maradt. A memóriamérésben ezek a tabok még nem nyitották meg a sidebart, ezért itt az első változtatás hatását mérjük.

| Tabok | 1. összehasonlítás megtakarítása | 2. összehasonlítás megtakarítása |
| --- | ---: | ---: |
| 20 | 32.3 MiB | 56.7 MiB |
| 50 | 74.8 MiB | 122.9 MiB |

Az aktív page target heapje kb. **1,48-ról 0,96 MiB-ra** csökkent; az üres iframe-dokumentum eltűnt. 50 tabnál a teljes böngésző megtakarítása átlagosan kb. 99 MiB volt. Ez indokol egy gondosan tesztelt production-javítást, de a mérés nem bizonyítja a kísérleti változat összes funkciójának helyességét.

Kötelező regressziós területek egy ilyen javításnál: első nyitás, hideg/meleg nyitás késleltetése, iframe load/fókusz átadás, DOM-javítás, tabváltás, vissza/előre navigáció, Fixed/Autohide váltás, megőrzött szerkesztők. Az izolált scriptkörnyezetek és a PiP maradó költsége ettől nem tűnik el.

## CPU és böngésző-API-forgalom

### Üresjárat

Nincs `setInterval` a production JavaScriptben. Az overlay javító observerei nem az oldal teljes DOM-alfáját figyelik, a sidebar fő frissítései aktivitáshoz kötöttek. Ezek jó alapok.

A 3 másodperces kontroll/autohide CPU-ablakok átfedtek; nincs bizonyíték jelentős, állandó plusz CPU-terhelésre. Egy külön 5 másodperces, 20 tabos üresjárati mintában **0** vizsgált Chrome API-hívás keletkezett, a teljes böngésző kb. **0,39%**-át használta egy CPU-magnak. Ez nem jelenti azt, hogy az extension minden körülmény között 0%-os, és nem helyettesít hosszú akkumulátor-/ébresztésmérést.

### Tabváltás

30 váltás egy 107 és egy 20 007 DOM-elemes, videó nélküli oldal között:

| API | PiP bekapcsolva | PiP kikapcsolva |
| --- | ---: | ---: |
| scripting.executeScript | 180 | 120 |
| tabs.get | 180 | 180 |
| tabs.sendMessage | 120 | 120 |
| storage.local.get | 150 | 150 |
| storage.session.get | 60 | 60 |
| tabGroups.query | 30 | 30 |
| tabs.query | 30 | 30 |

A bekapcsolt PiP mellett ez váltásonként 6 script-végrehajtási hívás, mivel a forrás és a cél tab is konfigurálódik. A verzióőr megakadályozza az ismételt vezérlőpéldányok létrejöttét, de az API/IPC-hívást és a fájl végrehajtásának belépési költségét nem szünteti meg.

A mesterségesen gyors, kb. 8 váltás/másodperces terhelés 1,70 CPU-másodpercet használt kb. 3,71 másodperc alatt; PiP off mellett 1,45 CPU-másodpercet kb. 3,73 másodperc alatt. Ez teljes böngészőterhelés egy rövid stresszteszten, nem normál használati átlag és nem tisztán a PiP CPU-költsége. Nem vetítjük ki fix százalékos optimalizálási ígéretként.

A mély médiakeresést használó `getState()` diagnosztikai mikroteszt mediánja a kis oldalon a 0,1 ms-os időzítési felbontás alatt maradt; 20 007 DOM-elemnél **5,3 ms**, 95. percentilise **6,7 ms** volt. A háttérben vizsgált videók keresése ugyanazt a DOM-gyökér-bejárást használja. A mikroteszt 25 szándékos hívást végzett; ez nem azt jelenti, hogy az extension alapjáraton ismételgeti ezt.

### Háttértab címváltozása

30 háttérbeli címváltozás — oldalbetöltés, mentett tabkötés és felhasználói interakció nélkül — a következőket okozta:

- 30 teljes `tabs.query`;
- 60 local-storage olvasás;
- 30 session-storage olvasás;
- 0 script-injektálás.

Ez az egyik legtisztább fölösleges munka: a nem kötött tabok minden releváns `onUpdated` eseménye a teljes kötés-helyreállítást indítja, még üres helyreállítási jelöltlistával is. A gyakran címet változtató oldalak és sok tab ezt felerősíthetik.

## Sidebar-életciklus

A kalibrált mérésben, 200 mentett linkkel:

- Első megnyitás: kb. **280 ms** a triggerre mozgatás kezdetétől a nyitott állapotig és a sorok elérhetőségéig.
- 40 meleg megnyitás mediánja **174 ms**, 95. percentilise **202 ms**. Ezek tartalmazzák a 80 ms-os szándékos nyitási várakozást és a mérés protokollköltségét; nem az animáció pontos végpontját mérik.
- A sidebar-renderer GC utáni JS heapje **2,16-ról 2,43 MiB-ra** nőtt 40 ciklus után. A 0,27 MiB különbség lehet bemelegedés/cache is: két végpontból nem bizonyítható és nem zárható ki memóriaszivárgás.
- A 40 ciklus utáni rendererben 536 DOM-node és 780 DOM-eseménykezelő volt. Ez mutatja a felület dekorátorainak költségét, de önmagában nem leak.
- A fókuszváltás utáni mérési pontban 1 betöltött sidebar frame maradt látható a target-listában az 50 tabon összesen. Ez nem 50 teljes UI-példány; a megmaradt target elengedését hosszabb idle/heap-snapshot mérésben érdemes követni.
- A nem mentett szerkesztők szándékosan megtartják a saját iframe-jüket. Sok ilyen tab memóriaigénye magasabb lehet; ez a megőrzési funkció ára, külön mérendő.

Az első, animációkat kivárás nélkül megszakító gyors ciklus egy nyitási várakozásnál megállt. A teljes audit nyers eredménye ezt hibaként megőrzi; a fenti 40 ciklus a külön életciklus-futásból származik, ahol nyitás és zárás után 220 ms-ot hagytunk az animációnak. A gyors megszakításos esetet nem minősítjük sikeres funkcionális tesztnek.

## Optimalizálási sorrend

| Sorrend | Változtatás | Várható érték | Kockázat / szükséges ellenőrzés |
| --- | --- | --- | --- |
| 1 | Üres iframe létrehozásának elhalasztása, alapjárati frame leválasztása | **Mért:** 50 tabnál 75–123 MiB kisebb teljes memória | Közepes: életciklus, DOM-javítás, fókusz, szerkesztő megőrzése |
| 2 | Kötés-helyreállítás csak ténylegesen rendezetlen kötéseknél; összevont eseménykezelés | 30 címváltozásnál a mért 30 teljes tablista-lekérés jelentős része elhagyható | Alacsony–közepes: restart utáni, megváltozott URL-es Favorites-kötések regressziója kiemelten fontos |
| 3 | PiP konfigurálás és fájlinjektálás szétválasztása, dokumentumonkénti készültség követése; redundáns sorbaállítás összevonása | Váltásonként 6 végrehajtási hívás jó része elhagyható | Közepes: aktiválási időbélyegek, owned/manual PiP, SPA és visszatérés változatlan működése |
| 4 | A mély médiakeresés előfeltételeinek szűkítése és gyökerek óvatos újrahasználata | Nagy DOM-on néhány ms-os tüskék mérséklése | A generic HTML5/shadow/iframe videók felismerése ne romoljon; ne hozzunk létre állandó DOM-pollingot |
| 5 | Közös, változtathatatlan UI-snapshot és célzott sorfrissítés | Nagy szervezettségi modellnél/egyedi ikonoknál kevesebb másolás és újrarajzolás | Magasabb: 14 külön storage kliens létezik; az összevonás ne veszítse el az ütközésvédelmet. Előbb nagy modell + sok ikon mellett mérendő |
| 6 | Fixed/PiP-off mellett a szükségtelen content script regisztrációk kikapcsolása | Maradó tabonkénti footprint csökkenthető új dokumentumokon | Közepes: meglévő tabokra visszakapcsolás, extension reload, és a már létrejött izolált világok nem tűnnek el automatikusan |

Első körben az 1–3. tételt javaslom külön, kis változtatásokként, minden lépés után ugyanennek a mérésnek az ismétlésével. A további célértékeket az első javítás kontrollméréséből érdemes meghatározni. CSS-apróságok vagy általános, mérés nélküli memoizálás most nem elsődlegesek.

## Korlátok és mellékleletek

Nem mértünk valódi YouTube/RTL stream dekódolást, többmonitoros macOS PiP-ablakot, több ezer mentett linket, sok feltöltött ikont, órákig tartó használatot, sok nyitva hagyott szerkesztőt vagy Mac energiamérést. Ezekre nem állítunk pontos RAM-/CPU-számot.

A normál funkcionális CI egyik párhuzamos futása a meglévő `browser-sidebar-history.mjs` tesztben megszűnt iframe targettel elbukott. Ez változatlan production forrás mellett történt. Az okát az erőforrás-audit nem tárta fel, ezért nem nyilvánítjuk automatikusan sem ártalmatlan tesztflakinessnek, sem bizonyított production hibának. A végső production-minősítés előtt tisztázandó.

## Reprodukálhatóság és adatok

- [Nyers eredmények](footprint-v3.1.14.json): minden ismétlés, az első részleges UI-hiba, a külön életciklus-futás és az ideiglenes kísérleti változat.
- [Teljes mérési futás](https://github.com/lophas/arc-sidebar-chrome/actions/runs/38745202000).
- [Életciklus-futás](https://github.com/lophas/arc-sidebar-chrome/actions/runs/38745835979).
- [Késleltetett iframe összehasonlítás](https://github.com/lophas/arc-sidebar-chrome/actions/runs/38746215572).
- Mérőprogram: [tools/footprint-audit.mjs](../../tools/footprint-audit.mjs). Linux/Chromium/Xvfb szükséges; a `/proc`-alapú PSS mérés közvetlenül nem fut macOS-en.

```bash
npm install --no-save --package-lock=false --ignore-scripts playwright-core@1.56.1
npx playwright-core install chromium --no-shell
AUDIT_SCOPE=full xvfb-run -a node tools/footprint-audit.mjs
# Külön résztesztek: AUDIT_SCOPE=lifecycle vagy AUDIT_SCOPE=ablation
```

