# Note di lavoro: allineamento codice ↔ documentazione

File di appunti versionato per riprendere il lavoro da qualsiasi computer. Aggiornarlo a ogni sessione: spuntare le voci fatte, aggiungere decisioni prese.

Ultima revisione completa: 2026-10-01 (commit di partenza `a2f2b68`).

Commit di questa sessione: `8446524` docs, `a77719a` import, `0bc664d` render, `6ba8bc9` policy, più il commit con D14/D28/D29/D30.

## Prossimi passi

1. C2/C3 (ruoli esistenti, lunghezza `conditions`), poi T2–T5 (test).
3. Da discutere: C4 (rimozione nodi), C5 (`mintVersion` da creator non holder), C6 (costo O(n) di `_currentCounts`).

## Stato verificato

- `npm test`: 40 casi, nessun esito inatteso; motivi dei revert verificati. Valori di gas aggiornati in [choreography-policies.md](choreography-policies.md#cost-benchmark) (3,756,456 / 3,664,473 / 91,983 / 424,397 / 143,079–187,688).
- Workflow completo `deploy → import → render → modify → render` su nodo locale: OK; il BPMN finale reimportato coincide con import + delta.
- `evaluate:policies`: OK.
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

## C. Interventi sul codice (da discutere)

### Contratti
- [x] C1 `setNodes` non verifica la simmetria degli archi (A.outgoing ∋ B ⇔ B.incoming ∋ A). Un delta incoerente viene accettato e poi il render produce XML invalido (`<bpmn:incoming>undefined</bpmn:incoming>`, vedi C9).
- [ ] C2 `initiatorRole` / `participantRole` non sono verificati contro i ruoli registrati.
- [ ] C3 Nessun vincolo su `conditions.length` vs `outgoing.length`; convenzione dati non uniforme (task con `[""]`, join con `[]`).
- [ ] C4 Nessuna rimozione di nodi (limite documentato) — valutare `removeNodes` con controllo della creator policy.
- [ ] C5 Un creator autorizzato può fare `mintVersion` di token non suoi, con qualsiasi policy (documentato, da confermare come scelta di design).
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
- [ ] T4 Celle non testate: configurazione master da non-admin; mint da creator non-admin; diniego `mintWithInitialModel`; `mintVersion` con policy diverse; `transferFrom` da non-holder e verso holder non idoneo; `setNodes` da non-holder; `setTokenURI`/`setLinked` (mai testati); `setHolderSmartPolicy` da non-holder; configurazione vincoli BPMN da non-admin.
- [ ] T5 Decisioni di design senza test: reset della holder policy al transfer; nuova versione vuota; nomi duplicati/vuoti in delta e `setRoles`.
- [ ] T6 Una sola `CreatorSmartPolicy` condivisa tra tutti gli asset di test: i vincoli di un caso si propagano ai successivi. _(i nuovi casi di coerenza usano già una policy dedicata)_
