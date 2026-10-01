# Note di lavoro: allineamento codice ↔ documentazione

File di appunti versionato per riprendere il lavoro da qualsiasi computer. Aggiornarlo a ogni sessione: spuntare le voci fatte, aggiungere decisioni prese.

Ultima revisione completa: 2026-10-01 (commit di partenza `a2f2b68`).

Commit di questa sessione: `8446524` docs, `a77719a` import, `0bc664d` render, `6ba8bc9` policy, `9f04b20` evaluation, `d663ccb` rimozione versioning, più il commit sui partecipanti dei ruoli (senza trailer di attribuzione).

## Prossimi passi

1. C2/C3 (ruoli esistenti, lunghezza `conditions`), poi T2–T5 (test).
3. Da discutere: C4 (rimozione nodi), C6 (costo O(n) di `_currentCounts`).

## Stato verificato

- `npm test`: 44 casi (35 + 9 sui partecipanti: categoria del ruolo, allowlist holder, associazione, diniego fuori allowlist, diniego categoria diversa, diniego EOA, diniego contratto non participant, diniego allowlist modificata da non-holder, rimozione), nessun esito inatteso; motivi dei revert e storia eventi verificati. Valori di gas in [choreography-policies.md](choreography-policies.md#cost-benchmark) (3,726,949 / 3,624,234 / 102,715 (2.76%) / 424,731 / 143,657–188,266). `evaluate:policies` OK.
- Dopo il cambio sui partecipanti (anche con categoria + allowlist): `ETH_USD_PRICE=3000 npm run evaluate:all` OK; i ruoli del `paper-example` sono esportati con indirizzo vuoto.
- Workflow completo `deploy → import → render → modify → render` su nodo locale: OK; il BPMN finale reimportato coincide con import + delta.
- `evaluate:policies`: OK.
- Comandi partecipanti su nodo locale con `paper-example`: assegnazione `BUYER` a "Bulk Buyer" OK e visibile nell'export raw; categoria diversa ed EOA rifiutati con `Operation DENIED by CREATOR role policy`; dopo il rifiuto il partecipante non resta in allowlist; `0x0` riporta il ruolo a vuoto.
- `ETH_USD_PRICE=3000 npm run evaluate:all` (con nodo locale): OK; il report finale linka i CSV, il report lifecycle cita il flow limit, il caso `Order` protetto è una modifica reale.

## Note sull'ambiente

- Su un computer nuovo, prima di `evaluate:all`: `npm ci`, `(cd bpmn-builder-js && npm ci)`, `npm run setup:evaluation` (scarica Chromium per la versione di Playwright installata) e `gnuplot` installato. Senza `npm ci`, `playwright` può mancare da `node_modules` anche se è in `package.json`.
- Queste note vanno tenute complete e committate insieme al lavoro relativo (richiesta dell'utente, 2026-10-01).
- Round trip import → render → re-import del `paper-example`: dati dei nodi identici.
- Colonne gnuplot ↔ CSV esportati: coerenti.

## Decisioni prese

- 2026-10-01 — Coerenza degli archi (C1) come vincolo **opt-in** della `CreatorSmartPolicy` (`setConsistentFlowsEnabled`), come gli altri vincoli strutturali: disattivato per default, così i delta a nodo singolo esistenti restano validi e i costi di default cambiano solo di un `SLOAD`.
- 2026-10-01 — Lato off-chain, il renderer (`normalize.js`) rifiuta **sempre** modelli con archi incoerenti o nodi sconosciuti, invece di produrre XML con `undefined`. `web3.js` e `nmt.js` emettono sempre `incoming`/`outgoing`, anche vuoti.
- 2026-10-01 — Importer: gli archi derivano da `sequenceFlow sourceRef/targetRef`; l'ordine dei figli `<incoming>`/`<outgoing>`, se presenti, è mantenuto (output del `paper-example` invariato).
- 2026-10-01 — Nome messaggio in import: `messageRef.name` → `flow.name` → `messageRef.id` → `flow.id`.
- 2026-10-01 — **Partecipanti dei ruoli** (decisioni dell'utente):
  - l'indirizzo di un ruolo è sempre o vuoto (`address(0)`, ruolo non assegnato) oppure un `ParticipantMutableAsset`; gli EOA non sono più ammessi;
  - il vincolo è **sempre attivo** nella `CreatorSmartPolicy` (`evaluateRoleUpdate`). ~~L'administrator configura il `ParticipantNMT` fidato con `setParticipantNmt`~~ → superato il 2026-10-01, vedi decisione "Categoria e allowlist";
  - la coreografia nasce **senza partecipanti**: `InitialModel` non ha più `roleAddresses` (firma di `mintWithInitialModel` cambiata anche nella master policy), l'import (`populate-local.js`) e la lifecycle evaluation usano indirizzi vuoti;
  - associare un partecipante è evoluzione della coreografia e lo fa **solo l'holder** con `setRoles` (creator + holder policy); **riassegnare o tornare a vuoto** è consentito agli stessi autorizzati; i ruoli protetti restano bloccati. Nessun consenso richiesto al partecipante.
- 2026-10-01 — **Categoria e allowlist dei partecipanti** (decisioni dell'utente, sostituisce `setParticipantNmt`): admin e creator non conoscono gli indirizzi precisi dei partecipanti, al più le tipologie; la Master policy governa il token (mint/trasferimenti), non l'evoluzione.
  - **Creator** stabilisce una **categoria per ruolo**: `CreatorSmartPolicy.setRoleCategory(ruolo, bytes32)`. L'indirizzo deve essere zero oppure un participant asset tokenizzato (`nmt()` dell'asset, poi `ownerOf(uint160(asset))` sul suo NMT) con `getDescriptor()` uguale alla categoria; ruolo senza categoria = qualsiasi participant asset. EOA e contratti non participant sempre rifiutati.
  - **Holder** mantiene un'**allowlist nella Holder policy**: `HolderSmartPolicy.setAllowedParticipant(asset, participant, bool)`, solo l'holder corrente, chiavi per asset **e holder** (dopo un transfer il nuovo holder parte da lista vuota). `setRoles` accetta solo indirizzi non zero presenti in lista.
  - Aggiunto `ParticipantMutableAsset.getDescriptor()`. La categoria è autodichiarata dal participant asset: la fiducia sul singolo partecipante viene dall'allowlist dell'holder.
  - La Holder policy decodifica gli indirizzi dalla calldata con `mcopy`: la copia byte per byte costava ~100k gas per `setRoles`.
- 2026-10-01 — `assign:participant` simula `setRoles` con `staticCall` prima di inviarlo: se la simulazione fallisce non parte nessuna transazione (altrimenti il `NonceManager` perde il nonce) e la voce di allowlist appena aggiunta viene revocata. Se il partecipante è già in lista, la voce non viene ri-scritta.
- 2026-10-01 — Nuovi docs [choreography-mutable-asset.md](choreography-mutable-asset.md) e [participant-mutable-asset.md](participant-mutable-asset.md) (campi, eventi, metodi, errori), collegati da `architettura.md` e dal README. Annotati due comportamenti: `getNode` di un nome sconosciuto restituisce valori vuoti (`START_EVENT`), `getRole` restituisce zero sia per ruolo non assegnato sia per ruolo inesistente; cambiare il `descriptor` di un participant non ricontrolla i binding esistenti.
- 2026-10-01 — `contract-hierarchy.md` riscritto sul `paper-example` (richiesta dell'utente): ruoli reali (Bulk Buyer, Manufacturer, Middleman, Supplier, Special Carrier), task di esempio `Order Special Transport`, 11 → 14 nodi con il delta, nuovo diagramma di un'istanza con participant asset `INTERMEDIARY`/`CARRIER`, comandi di assegnazione; eliminati gli esempi `Ale`/`Fra`.
- 2026-10-01 — Creato `CLAUDE.md`: i commit non devono contenere trailer `Co-Authored-By` né attribuzioni a Claude/Anthropic (i commit precedenti di questa sessione li contengono ancora).
- 2026-10-01 — **Versioning rimosso** (richiesta dell'utente): eliminati `mintVersion`, `predecessorOf`, `versionOf` da `ChoreographyNMT` e `MINT_VERSION`, `versioningEnabled`, `setVersioningEnabled` da `MasterSmartPolicy`. La versione è mantenuta dalla blockchain: ogni modifica accettata è una transazione ed emette `ChoreographyInitialized` / `RolesChanged` / `NodesChanged`. I test di versioning sono stati sostituiti da un controllo che gli eventi `NodesChanged` riproducano la sequenza degli aggiornamenti. Gas di riferimento aggiornati: 3,756,566 / 3,664,451 / 92,115 (2.45%) / 424,441 / 143,123–187,732.
- 2026-10-01 — `clean` rimuove anche gli `*.nmt.json` importati e i file temporanei di evaluation in `/tmp` (nessun file versionato coinvolto).
- 2026-10-01 — I test di diniego verificano il motivo del revert; il caso "task limit" usa limiti (2, 4) per violare solo il limite sui task.

## D. Correzioni alla documentazione

### Contratti e policy
- [x] D1 [architettura.md:24](architettura.md) dice che cambiare la creator policy "richiede entrambe" le policy; il codice ([MutableAsset.sol:62-77](../contracts/base/MutableAsset.sol)) usa solo la creator policy (e la riga 94 dello stesso file è corretta).
- [x] D2 [contract-hierarchy.md](contract-hierarchy.md): la creator policy valida anche `setRoles` (`evaluateRoleUpdate`), non solo `setNodes`; aggiornare albero e grafo mermaid.
- [x] D3 La `CreatorSmartPolicy` participant vieta `setCreatorSmartPolicy` a chiunque: la creator policy di un participant asset è immutabile. Non documentato.

### Comandi e workflow
- [x] D4 [commands-and-scripts.md](commands-and-scripts.md): manca `evaluate:paper` nella tabella; mancano `run-paper-example-experiment.js`, `generate-evaluation-summary.js`, `render-bpmn-images.js` nelle liste script.
- [x] D5 `evaluate:summary` scrive principalmente `evaluation/final-report.generated.md` (`summary.generated.md` è una copia).
- [x] D6 `evaluate:all` / `evaluate:paper` richiedono anche **gnuplot**.
- [x] D7 [bpmn-to-nmt-workflow.md:17](bpmn-to-nmt-workflow.md): `--no-render` è opzionale (`[--no-render]`), il default renderizza.
- [x] D8 `import:asset` accetta un terzo argomento `[output.nmt.json]`; default `bpmn-builder-js/example/input/<nome>.nmt.json`.
- [x] D9 `render:asset`: il JSON passato serve solo per i metadati di render (`render` del delta, oppure derivati dal file NMT); il modello è sempre letto dalla chain. Elencare i file prodotti (manifest, raw, normalized, xml).
- [x] D10 Formato delta: tutti i campi del nodo obbligatori e tipizzati; `render` obbligatorio **anche con `--no-render`**; `roles` sovrascrive anche ruoli esistenti (README dice "for new roles").
- [x] D11 Variabili d'ambiente non documentate: `RPC_URL`, `DEPLOYER_PRIVATE_KEY` (default: account Hardhat #0).
- [x] D12 `import:asset` assegna ai ruoli gli indirizzi `eth_accounts[1..]`: funziona solo su nodo locale e con ≤ 19 ruoli.
- [x] D13 Script legacy citano comandi npm inesistenti (`augment:parallel-gateway-example`, `flow:import-bpmn`).
- [x] D14 _(risolto nel codice: `clean` ora rimuove anche `*.nmt.json`, `*.generated.svg` e i due file in `/tmp`)_ `clean` non rimuoveva `example/input/*.nmt.json` né i file temporanei in `/tmp` (`chornmt-paper-example-policy-evaluation.nmt.json`, `chornmt-bpmn-image-viewer.html`). Correggere doc o codice.

### Mapping BPMN ↔ NMT ([bpmn-to-nmt-workflow.md](bpmn-to-nmt-workflow.md))
- [x] D15 Espandere la tabella: nomi nodo = `name` (o `id`) e devono essere unici; `conditions` = nomi dei flow uscenti (non `conditionExpression`), con `""` di padding; ruolo = `name` del participant (o `id`); risoluzione nome messaggio; solo il primo `bpmn:Choreography` è importato.
- [x] D16 Documentare la regola split/join: `gatewayDirection="Converging"` → join; senza direzione, >1 incoming e ≤1 outgoing → join; gateway misto → split; event-based sempre 7.
- [x] D17 Elementi non supportati (eventi intermedi, sub/call choreography, gateway inclusivi/complessi) causano errore, non vengono ignorati. Event definition su start/end perse.
- [x] D18 Task: serve `initiatingParticipantRef` + almeno un altro participant; participant oltre il secondo ignorati.

### bpmn-builder-js/README.md
- [x] D19 L'export legge `ChoreographyMutableAsset`, non `BPMNChoreography.sol` (righe 27, 169).
- [x] D20 Gli id sono generati da `src/normalize.js`, non dall'export mapper (riga 33 vs 188).
- [x] D21 Aggiungere `import:bpmn`, `render:nmt`, `src/normalize.js`, `src/nmt.js` alla struttura e agli script.
- [x] D22 DI (`BPMNDiagram`) solo per input choreography; `collaboration` solo per input process.
- [x] D23 Validazione più ampia di quanto scritto; i `type` sconosciuti sono rifiutati da bpmn-moddle.
- [x] D24 Supporto gateway limitato (nessun `gatewayDirection`, condition non emessa); riga 211 contraddice 195/197.
- [x] D25 L'output raw dell'export non ha la stessa forma degli esempi di input (è name/key-based); documentare la modalità di input `choreography` e lo schema del manifest.

### Evaluation
- [x] D26 [evaluation/README.md:136](../evaluation/README.md): le "repeated runs" non si accumulano, `evaluate:paper` svuota `metrics/` a ogni run.
- [x] D27 Solo `phase-duration`, `phase-gas`, `model-comparison` sono generati automaticamente; gli altri tre `.gp` vanno lanciati a mano.
- [x] D28 _(risolto nel codice: `generate-evaluation-summary.js` linka `evaluation/*.generated.csv`)_ Il report finale non linkava i CSV in `evaluation/*.generated.csv` (doc dice di sì).
- [x] D29 Il diniego per flow-limit manca in evaluation/README.md:108 e nel testo del report. _(README e testo del report corretti)_
- [x] D30 Il caso "modifica di `Order` protetto" re-inviava `Order` invariato. _(risolto nel codice: ora cambia `initiatingMessage`)_
- [x] D31 Prezzo ETH/USD condiviso tra i report solo se `ETH_USD_PRICE` è impostato; valore invalido/0 → fetch silenzioso.
- [x] D32 `model-comparison.gp:11` etichetta "Parallel gateways" ma la colonna conta tutti i gateway.

## P. Partecipanti (aperti)

- [x] P1 Comandi per i partecipanti: `deploy:participants`, `mint:participant -- <categoria>`, `set:role-category -- <asset> <ruolo> <categoria>` (creator), `assign:participant -- <asset> <ruolo> <participant|0x0>` (holder: allowlist + `setRoles`). Implementati in `scripts/participants.js`; deployment salvato in `bpmn-builder-js/example/contract/participant-deployment.generated.json` (rimosso da `clean`).
- [ ] P2 L'export BPMN usa ancora il nome del ruolo come identità; l'indirizzo del participant asset è solo metadato (`web3.js`) e non compare nell'XML. Valutare se esporlo (es. extension element o `participant` id).
- [ ] P3 Nessun controllo che il ruolo referenziato da un task esista (vedi C2) né che sia assegnato prima di eseguire la coreografia.
- [ ] P4 Un `ParticipantMutableAsset` non può essere distrutto: il caso "partecipante rimosso indipendentemente dalla coreografia" citato nella doc non è ancora modellato.

## C. Interventi sul codice (da discutere)

### Contratti
- [x] C1 `setNodes` non verifica la simmetria degli archi (A.outgoing ∋ B ⇔ B.incoming ∋ A). Un delta incoerente viene accettato e poi il render produce XML invalido (`<bpmn:incoming>undefined</bpmn:incoming>`, vedi C9).
- [ ] C2 `initiatorRole` / `participantRole` non sono verificati contro i ruoli registrati.
- [ ] C3 Nessun vincolo su `conditions.length` vs `outgoing.length`; convenzione dati non uniforme (task con `[""]`, join con `[]`).
- [ ] C4 Nessuna rimozione di nodi (limite documentato) — valutare `removeNodes` con controllo della creator policy.
- [x] C5 ~~Un creator autorizzato può fare `mintVersion` di token non suoi~~ — superato: `mintVersion` è stato rimosso (vedi decisioni).
- [ ] C6 `_currentCounts` fa una chiamata esterna per ogni nodo a ogni `setNodes`: costo O(n) crescente col modello. Valutare contatori in storage nell'asset.
- [ ] C7 Se la creator policy viene sostituita con un contratto che non implementa `IChoreographyCreatorPolicy`, `setNodes`/`setRoles` vanno in revert permanente.

### Importer / renderer (bpmn-builder-js)
- [x] C8 **Importante**: l'importer costruisce gli archi solo dai figli `<incoming>`/`<outgoing>`, ignorando `sequenceFlow sourceRef/targetRef`. BPMN validi senza quei figli vengono importati senza archi, in silenzio.
- [x] C9 Archi incoerenti nel NMT → XML con `undefined`, nessun errore. Validare in `nmt.js`.
- [ ] C10 `conditionExpression` ignorata in import e non emessa in render.
- [ ] C11 `gatewayDirection` mai scritto in XML: join con 1 incoming ri-importato come split.
- [ ] C12 Collisione di id generati (`A`, `A?`, `A 2` → due `StartEvent_A_2`) in `normalize.js:8-18`.
- [ ] C13 Archi duplicati verso lo stesso target collassano.
- [ ] C14 Messaggi d'errore fuorvianti (nodo sconosciuto in `outgoing`, task senza `participantRole`). _(nodo sconosciuto: risolto con C9; resta il task senza `participantRole`)_
- [x] C15 Fallback `flow.name` per il nome messaggio è irraggiungibile (`import-bpmn.js:43`).
- [ ] C16 Collisioni di chiavi in `normalize.js` tra `id`/`role`/`name`.

### Script
- [ ] C17 ABI di `setRoles`/`setNodes` duplicata in tre script: caricare dagli artifact.
- [ ] C18 `render-asset.js:36` mappa i tipi nodo per le metriche in modo approssimativo (end event contati come 0).
- [ ] C19 `modify:asset` richiede `render` anche con `--no-render`.
- [ ] C20 `run-paper-example-experiment.js:158` stampa solo `error.message`, niente stack.

## T. Lacune nei test

- [x] T1 I test di diniego non verificano il motivo del revert. Due casi "task limit" violano anche il flow limit e passerebbero anche se il check sui task fosse rotto.
- [ ] T2 `deny` in `run-policy-lifecycle-evaluation.js:30`: `assert.fail` dentro il `try` viene inghiottito; manca il guard out-of-gas.
- [ ] T3 Un solo signer copre master admin, creator, creator-policy admin e holder: molte celle "no" della tabella "Who can do what" sono indistinguibili. Usare signer distinti.
- [ ] T4 Celle non testate: configurazione master da non-admin; mint da creator non-admin; diniego `mintWithInitialModel`; `transferFrom` da non-holder e verso holder non idoneo; `setNodes` da non-holder; `setTokenURI`/`setLinked` (mai testati); `setHolderSmartPolicy` da non-holder; configurazione vincoli BPMN da non-admin.
- [ ] T5 Decisioni di design senza test: reset della holder policy al transfer; nomi duplicati/vuoti in delta e `setRoles`.
- [ ] T6 Una sola `CreatorSmartPolicy` condivisa tra tutti gli asset di test: i vincoli di un caso si propagano ai successivi. _(i nuovi casi di coerenza usano già una policy dedicata)_
