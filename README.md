# ChorNMT

ChorNMT importa una coreografia BPMN in un asset NMT locale, permette di modificarne i nodi on-chain e rigenera un BPMN dalla configurazione memorizzata nell'asset.

Il percorso principale usa `paper-example`: una coreografia logistica con compratore, produttore, intermediario, fornitore e trasportatore speciale. Il repository contiene anche `parallel-gateway-example`, un modello piccolo usato per dimostrazioni tecniche di split e join paralleli.

## Prerequisiti

- Node.js 20 o successivo
- npm

Installa entrambe le dipendenze:

```bash
npm install
(cd bpmn-builder-js && npm install)
```

## Percorso principale: importa e modifica il paper example

Apri due terminali nella root del repository.

Nel primo, compila i contratti e avvia la blockchain locale:

```bash
npm run compile
npm run node
```

Nel secondo, crea un nuovo asset. Il comando stampa il suo indirizzo:

```bash
npm run deploy:local
```

Importa il BPMN logistico nell'asset appena creato, riesportalo e genera il BPMN di base:

```bash
npm run flow:import-bpmn -- <asset-address> references/paper-example.bpmn
```

Applica poi la modifica riutilizzabile. Essa inserisce uno split parallelo dopo `Order Special Transport`: la raccolta dei dettagli e la preparazione della documentazione del trasporto procedono in parallelo e si ricongiungono prima della waybill.

```bash
npm run apply:asset-delta -- <asset-address> scripts/data/paper-example-parallel-transport-preparation.delta.json
```

Il BPMN finale è generato in:

```text
bpmn-builder-js/example/output/paper-example-parallel-transport-preparation-from-contract.generated.bpmn.xml
```

## Come modificare un asset già popolato

Non si modifica direttamente il BPMN XML esportato: è una vista dell'asset. Si crea invece un file delta JSON, si applica all'asset con `apply:asset-delta` e si rigenera il BPMN.

Usa [scripts/data/paper-example-parallel-transport-preparation.delta.json](scripts/data/paper-example-parallel-transport-preparation.delta.json) come modello. Un delta contiene:

- `render`: nome e metadati del BPMN da generare;
- `nodes`: i soli nodi aggiunti o cambiati, ciascuno descritto nel suo stato completo;
- `roles` opzionale: mappa `nome ruolo → address Ethereum`, per ruoli nuovi.

Quando cambia un collegamento, includi nel delta entrambi i nodi agli estremi con i rispettivi `incoming` e `outgoing` completi. L'asset può aggiungere o sostituire nodi, ma al momento non può rimuoverne definitivamente uno.

I nomi di nodi e ruoli sono le chiavi di riferimento del contratto. Per importare un BPMN diverso o ricominciare dall'asset iniziale, esegui di nuovo `deploy:local` e usa il nuovo indirizzo: l'asset non svuota le liste di nomi già memorizzate.

## Altri esempi

Il repository include anche `pizza-delivery`, un esempio introduttivo, e `parallel-gateway-example`, un modello minimo per verificare split e join paralleli. Sono dataset tecnici separati dal `paper-example` e richiedono un asset nuovo quando si cambia modello.

I relativi comandi e lo scopo di ciascuno sono raccolti in [Altri esempi](docs/other-examples.md). Il README mantiene invece un solo percorso operativo: `paper-example` e il suo delta parallelo.

## File generati

Ogni import, export o rendering produce file in:

```text
bpmn-builder-js/example/input/
bpmn-builder-js/example/output/
bpmn-builder-js/example/contract/
```

I file con suffisso `.generated.*` sono artefatti locali ignorati da Git: possono essere rigenerati con i comandi sopra. I BPMN di riferimento e i delta JSON restano invece versionati.

## Documentazione tecnica

- [Workflow BPMN → NMT](docs/bpmn-to-nmt-workflow.md): formato NMT, importazione e regole per i delta.
- [Aggiornamenti delta e chiamate Solidity](docs/delta-update-and-solidity-calls.md): dettagli di `setNodes(...)` e `setRoles(...)`.
- [Gerarchia dei contratti](docs/contract-hierarchy.md): modello degli asset e delle policy.
- [bpmn-builder-js](bpmn-builder-js/README.md): renderer BPMN e formato JSON intermedio.
- [Altri esempi](docs/other-examples.md): pizza delivery e parallel gateway.
