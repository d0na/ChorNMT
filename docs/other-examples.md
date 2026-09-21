# Altri esempi

Questa pagina raccoglie gli esempi tecnici che non costituiscono il percorso principale del progetto. Per il flusso BPMN completo, con importazione e modifica on-chain, usa [paper-example](../README.md).

Ogni comando in questa pagina deve usare un asset appena creato con `npm run deploy:local`. Non riutilizzare un asset usato per un dataset diverso: il contratto conserva i nomi di nodi e ruoli già salvati.

## Pizza delivery

`pizza-delivery` è il dataset predefinito, definito negli script. È utile per un rendering rapido e non deriva da un file BPMN importato.

```bash
npm run flow:local -- <asset-address>
```

Il comando popola l'asset, esporta i dati dal contratto e genera il BPMN in `bpmn-builder-js/example/output/pizza-delivery-from-contract.generated.bpmn.xml`.

## Parallel gateway example

`parallel-gateway-example` è un modello sintetico con uno split e un join paralleli. Serve a verificare il supporto ai gateway senza la complessità del caso logistico.

```bash
npm run flow:local -- <asset-address> parallel-gateway-example
```

Per vedere un aggiornamento incrementale sullo stesso modello, esegui:

```bash
npm run augment:parallel-gateway-example -- <asset-address>
```

Lo script carica il modello base, genera un BPMN iniziale, aggiunge `Activity4` dopo il join parallelo e genera un secondo BPMN. Il dettaglio delle chiamate `setNodes(...)` è in [Aggiornamenti delta e chiamate Solidity](delta-update-and-solidity-calls.md).
