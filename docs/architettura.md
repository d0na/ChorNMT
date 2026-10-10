# Architettura di ChorNMT

ChorNMT conserva una coreografia BPMN in un **asset mutabile on-chain**. Un token ERC-721 (l'NMT, *Non-fungible Mutable Token*) ne rappresenta il possesso, le **smart policy** decidono chi può creare, modificare e trasferire, e il BPMN viene **rigenerato** dallo stato on-chain quando serve.

Questo documento descrive i componenti, a cosa servono e come sono fatti al loro interno. La generazione del BPMN dallo stato on-chain ha un documento dedicato: [Rendering](rendering.md).

## Vista d'insieme

I diagrammi UML sono in [UML diagrams](uml.md): i casi d'uso sono scritti a mano in `docs/uml/` e verificati con `check:use-cases` contro le tabelle di fiducia, i test e le evidenze; i diagrammi di sequenza, uno per fase F1–F8 dell'esperimento, sono generati dalle tracce delle chiamate in `evaluation/evidence/uml/`.

```mermaid
flowchart LR
  subgraph offchain[Off-chain · JavaScript]
    B[BPMN sorgente] --> I[Importer<br/>import-bpmn.js]
    I --> D[Dataset NMT<br/>.nmt.json]
    D --> M[choreography-model.js<br/>abi.encode]
    DL[Delta JSON] --> A[apply-asset-delta.js]
    R[Render<br/>web3.js + bpmn-builder-js] --> X[BPMN rigenerato]
  end
  subgraph onchain[On-chain · Solidity]
    NMT[ChoreographyNMT<br/>ERC-721] -->|crea e possiede| CMA[ChoreographyMutableAsset]
    MP[MasterSmartPolicy] -->|autorizza mint<br/>e trasferimenti| NMT
    CP[CreatorSmartPolicy] -->|autorizza e vincola<br/>le modifiche| CMA
    HP[HolderSmartPolicy] -->|seconda approvazione| CMA
    TR[ChoreographyTokenURIRenderer] -->|legge| CMA
    NMT -->|tokenURI| TR
    MC[Contratto modello<br/>SSTORE2] -->|letto al mint| CMA
    NMT -.->|immutable| MC
  end
  M -->|deploy del codice| MC
  A -->|setRoles + setNodes| CMA
  CMA -->|tokenURI| R
```

Il ciclo di vita tipico ha quattro passi: **import** di un BPMN nel modello di un tipo di coreografia; **deploy** di policy, renderer, contratto del modello e NMT, e mint di un'istanza che nasce con quel modello; **modifica** tramite delta JSON; **render** del BPMN dallo stato corrente. Il BPMN rigenerato è una vista: le modifiche passano sempre dall'asset, mai dal file XML. Comandi e formati sono in [Commands and scripts](commands-and-scripts.md) e [BPMN to NMT workflow](bpmn-to-nmt-workflow.md).

## Principi di progetto

- **Un asset, un contratto.** Ogni token corrisponde a un contratto asset separato e il `tokenId` è l'indirizzo dell'asset (`uint160(address)`). Dal token si risale all'asset senza tabelle di lookup.
- **Autorizzazione separata dai dati.** Gli asset contengono il modello, le policy contengono le regole. Una policy si sostituisce senza toccare il modello, e un asset può usare policy diverse da un altro.
- **Identità per nome.** Nodi e ruoli sono indicizzati per nome: il nome è la chiave usata da delta, vincoli e render. Gli ID BPMN non sono salvati on-chain e vengono rigenerati dai nomi.
- **Scrittura per nodo completo.** `setNodes` sostituisce interamente i nodi indicati. Un delta contiene solo i nodi cambiati, ma ciascuno nel suo stato finale completo.
- **Metadati derivati, non salvati.** `tokenURI` è calcolato dallo stato dell'asset, quindi non può divergere dal modello.

## Livelli e gerarchia dei contratti

```text
contracts/
├── base/
│   ├── NMT.sol                  abstract  ERC721Enumerable: mint, trasferimento con consenso dell'asset
│   ├── MutableAsset.sol         abstract  riferimenti a NMT e policy, modifier di autorizzazione
│   ├── IMutableAsset.sol        interface viste comuni a ogni asset (holder, policy, NMT)
│   └── SmartPolicy.sol          abstract  evaluate(subject, action, resource), decodifica degli argomenti
├── choreography/
│   ├── ChoreographyNMT.sol               NMT delle coreografie, master policy, tokenURI
│   ├── ChoreographyMutableAsset.sol      modello della coreografia (ruoli e nodi)
│   ├── ChoreographyTokenURIRenderer.sol  genera i metadati JSON dallo stato dell'asset
│   ├── MasterSmartPolicy.sol             chi crea, chi può possedere, trasferimenti (hardcoded)
│   ├── CreatorSmartPolicy.sol            chi modifica; nessun vincolo BPMN (hardcoded)
│   ├── ConstrainedCreatorSmartPolicy.sol abstract  regole dei vincoli strutturali BPMN e dei ruoli
│   ├── CreatorSmartPolicyTestScenario.sol  vincoli dello scenario dei test (letterali)
│   ├── CreatorSmartPolicyPaperScenario.sol vincoli dello scenario paper (letterali)
│   ├── ChoreographyParticipantAM.sol     attribute manager: tipo della licenza che interpreta un ruolo
│   ├── IChoreographyParticipantAM.sol    interfaccia dell'attribute manager
│   ├── HolderSmartPolicy.sol             seconda approvazione dell'holder
│   ├── DenyAllSmartPolicy.sol            policy che nega tutto (per bloccare un asset)
│   ├── IChoreographyAsset.sol            viste dell'asset usate da policy e renderer; l'asset la implementa
│   └── IChoreographyPolicy.sol           interfaccia dei controlli su nodi e ruoli, implementata da Creator e Holder
└── participant/                          livello participant, non usato dagli script (vedi sotto)
    └── IParticipantAsset.sol             viste della licenza usate dalle policy; la licenza la implementa
```

```mermaid
classDiagram
  class ERC721Enumerable
  class NMT {
    <<abstract>>
    +mint(to, creatorPolicy, holderPolicy)
    +transferFrom(from, to, tokenId)
    +getMutableAssetAddress(tokenId)
    #_mint(to, creatorPolicy, holderPolicy)*
  }
  class MutableAsset {
    <<abstract>>
    +nmt
    +linked
    +creatorSmartPolicy
    +holderSmartPolicy
    +getHolder()
    +setHolderSmartPolicy()
    +setCreatorSmartPolicy()
    +setLinked()
    +transferFrom(from, to)
  }
  class SmartPolicy {
    <<abstract>>
    +evaluate(subject, action, resource) bool
  }
  ERC721Enumerable <|-- NMT
  NMT <|-- ChoreographyNMT
  NMT <|-- ParticipantNMT
  MutableAsset <|-- ChoreographyMutableAsset
  MutableAsset <|-- ParticipantMutableAsset
  SmartPolicy <|-- MasterSmartPolicy
  SmartPolicy <|-- CreatorSmartPolicy
  CreatorSmartPolicy <|-- ConstrainedCreatorSmartPolicy
  SmartPolicy <|-- HolderSmartPolicy
  SmartPolicy <|-- DenyAllSmartPolicy
  ChoreographyNMT ..> ChoreographyMutableAsset : crea
  ChoreographyNMT ..> MasterSmartPolicy : consulta
  ChoreographyNMT ..> ChoreographyTokenURIRenderer : tokenURI
  ChoreographyMutableAsset ..> CreatorSmartPolicy : consulta
  ChoreographyMutableAsset ..> HolderSmartPolicy : consulta
```

## Livello base

### `SmartPolicy`

**A cosa serve:** è il contratto astratto di ogni policy. Tutte le decisioni di autorizzazione passano da una sola funzione:

```solidity
function evaluate(address subject, bytes memory action, address resource) public view returns (bool);
```

| Parametro | Contenuto |
| --- | --- |
| `subject` | Chi agisce, di solito `msg.sender`; per i trasferimenti è `from`. |
| `action` | La chiamata codificata ABI: selector (4 byte) seguito dagli argomenti. |
| `resource` | Il contratto interessato: l'asset, oppure l'NMT per i mint. |

I mutator dell'asset passano alle policy `msg.data` come `action`, senza ricodificare gli argomenti. `decodeSignature(action)` estrae il selector, e le policy confrontano quel valore con costanti come `bytes4(keccak256("setNodes(...)"))`. Una policy può anche leggere gli argomenti dentro `action`, come fa `MasterSmartPolicy` con `_addressAt(action, offset)` per ricavare holder e Creator policy. `_addressAt` e `_wordAt` stanno nel base `SmartPolicy`, condivisi da tutte le policy, e su un'azione troppo corta falliscono con `MalformedAction()`.

### `NMT`

**A cosa serve:** è la base ERC-721 che collega ogni token al suo asset e che, prima di ogni trasferimento, chiede il consenso all'asset.

**Struttura interna:** non ha stato proprio oltre a quello di `ERC721Enumerable`. Il legame tra token e asset è puramente aritmetico:

```text
tokenId = uint160(address(asset))        asset = address(uint160(tokenId))
```

| Funzione | Comportamento |
| --- | --- |
| `mint(to, creatorPolicy, holderPolicy)` | Rifiuta `to == 0` e delega a `_mint`, che le sottoclassi implementano creando l'asset. |
| `transferFrom(from, to, tokenId)` | Il modifier `transferFromEvaluation` chiama prima `MutableAsset.transferFrom(from, to)` sull'asset, che valuta la Creator policy, e solo dopo esegue il trasferimento ERC-721. |
| `getMutableAssetAddress(tokenId)` | Converte il token nell'indirizzo del suo asset. |

### `MutableAsset`

**A cosa serve:** è la base di ogni asset. Conserva i riferimenti al proprio NMT e alle due policy di istanza e fornisce i modifier di autorizzazione.

**Struttura interna:**

| Stato | Tipo | Significato |
| --- | --- | --- |
| `nmt` | `address immutable` | L'NMT che ha creato l'asset. È l'unico che può chiamare le funzioni `onlyNMT`. |
| `creatorSmartPolicy` | `address` | Policy che esprime le regole del creator. L'holder non può rimuoverla. |
| `holderSmartPolicy` | `address` | Policy scelta dall'holder. Un trasferimento la azzera. |
| `linked` | `address` | Collegamento opzionale verso un altro asset o NMT. Oggi nessuno script lo usa. |

| Modifier | Regola |
| --- | --- |
| `evaluatedBySmartPolicies` | Devono approvare sia la Creator sia la Holder policy. Se la Holder policy è `address(0)` l'operazione fallisce con `HolderPolicyDisabled()`; un diniego fallisce con `OperationDenied(layer)` (`0` Creator, `1` Holder). |
| `evaluatedByCreator` | Decide solo la Creator policy. Si usa per `transferFrom` e `setCreatorSmartPolicy`. |
| `evaluatedByHolder` | Decide solo la Holder policy. Oggi non è usato. |
| `onlyHolder` | `msg.sender` deve essere il proprietario del token. |
| `onlyNMT` | `msg.sender` deve essere l'NMT. |

| Funzione | Chi decide | Effetto |
| --- | --- | --- |
| `getHolder()` | — | Restituisce `NMT.ownerOf(tokenId)`: il possesso è registrato solo sull'NMT. |
| `setHolderSmartPolicy(address)` | `onlyHolder` | L'holder sceglie la propria policy. |
| `setCreatorSmartPolicy(address)` | Creator policy | La Creator policy decide chi può sostituirla. Quella della coreografia lo consente solo al suo `administrator`. |
| `setLinked(address)` | Creator e Holder | Imposta `linked`. |
| `transferFrom(from, to)` | `onlyNMT` e Creator | Approva il trasferimento e azzera `holderSmartPolicy`: il nuovo holder deve installarne una prima di modificare il modello. |

## Livello coreografia

### `ChoreographyNMT`

**A cosa serve:** rappresenta **un tipo di coreografia**, non un contenitore generico: un'altra coreografia è un altro NMT. Conia i token, cioè le istanze del tipo, crea un `ChoreographyMutableAsset` per ciascuno, fa passare mint e trasferimenti dalla Master policy ed espone `tokenURI`. Master policy, `evaluatedByMaster`, `mint`, `transferFrom` e `setMasterSmartPolicy` stanno nel base `NMT`, condiviso con `ParticipantNMT`.

**Struttura interna:**

| Stato | Tipo | Significato |
| --- | --- | --- |
| `masterSmartPolicy` | `address` (nel base `NMT`) | Policy consultata da `evaluatedByMaster` su ogni operazione dell'NMT. Si sostituisce con `setMasterSmartPolicy`, solo se la Master corrente lo consente (al suo `administrator`). |
| `tokenURIRenderer` | `address immutable` | Contratto che genera i metadati. Si passa al costruttore. |
| `model` | `address immutable` | Contratto dati (SSTORE2) il cui codice è `abi.encode(InitialModel)`: il modello del tipo. Si passa al costruttore, che rifiuta un indirizzo senza codice. |

| Funzione | Master policy richiede | Effetto |
| --- | --- | --- |
| `mint(to, creator, holder)` | creator autorizzato, `to` idoneo | Crea l'asset con `new ChoreographyMutableAsset(nmt, creator, holder, model)`: l'asset nasce con il modello del tipo. Poi conia il token. |
| `transferFrom(from, to, tokenId)` | `subject == from == holder`, `to` idoneo | Poi l'asset valuta la Creator policy e il token viene trasferito. |
| `setMasterSmartPolicy(policy)` | chiamante `administrator` della Master corrente; `policy` diversa da zero | Sostituisce la Master: da quel momento decide lei mint e trasferimenti. |
| `tokenURI(tokenId)` | — (lettura) | Verifica che il token esista e restituisce `renderer.tokenURI(asset)`. |

Il mint usa `ERC721._mint` e non `_safeMint`: nessuna callback raggiunge il destinatario prima che l'asset sia inizializzato.

L'NMT non tiene un registro delle versioni: la storia di un modello è la blockchain stessa, cioè le transazioni `setNodes`/`setRoles` e gli eventi `NodesChanged`/`RolesChanged` dell'asset, e uno stato passato si legge interrogando l'asset a un blocco precedente.

**Vincolo di dimensione:** l'NMT contiene il bytecode dell'asset, perché lo crea con `new`. Occupa 21.440 byte su un limite di 24.576; il modello non sta nell'NMT ma nel contratto dati, che ha un suo limite di 24.576 byte (il paper example ne occupa 11.136). Per questo la generazione del JSON sta in un contratto separato.

### `ChoreographyMutableAsset`

**A cosa serve:** conserva il modello della coreografia (ruoli e nodi), applica le modifiche autorizzate e le fa validare dalla Creator policy.

**Struttura interna.** Tutto il modello è in un unico `Descriptor` privato:

```solidity
struct Descriptor {
    mapping(string => Node)    nodesByName;  // nome -> nodo
    mapping(string => bool)    hasNode;      // esistenza
    string[]                   nodeNames;    // ordine di inserimento, per l'enumerazione
    mapping(string => address) roles;        // nome ruolo -> indirizzo
    mapping(string => bool)    hasRole;
    string[]                   roleNames;
}
```

Le mappe servono per l'accesso diretto per nome, gli array per enumerare, perché in Solidity le mappe non si possono iterare. Un nome già presente viene sovrascritto e non duplicato. Non esiste una funzione di rimozione: gli array crescono e basta.

```solidity
struct Node {
    string   name;               // chiave, uguale alla chiave della mappa
    NodeType nodeType;
    string[] incoming;           // nomi dei nodi predecessori
    string[] outgoing;           // nomi dei nodi successori
    string[] conditions;         // condizione per ogni arco uscente, stesso indice di outgoing
    string   initiatorRole;      // solo task: ruolo che avvia
    string   participantRole;    // solo task: ruolo destinatario
    string   initiatingMessage;  // solo task: messaggio initiator -> participant
    string   returnMessage;      // solo task: messaggio di risposta
}
```

| `NodeType` | Valore | Elemento BPMN |
| --- | ---: | --- |
| `START_EVENT` | 0 | `startEvent` |
| `END_EVENT` | 1 | `endEvent` |
| `TASK` | 2 | `choreographyTask` |
| `EXCLUSIVE_SPLIT` | 3 | `exclusiveGateway` divergente |
| `EXCLUSIVE_JOIN` | 4 | `exclusiveGateway` convergente |
| `PARALLEL_SPLIT` | 5 | `parallelGateway` divergente |
| `PARALLEL_JOIN` | 6 | `parallelGateway` convergente |
| `EVENT_BASED_GATEWAY` | 7 | `eventBasedGateway` |

Gli archi sono salvati **due volte**: `A.outgoing` contiene `B` e `B.incoming` contiene `A`. Il contratto non verifica che i due lati siano coerenti. Per questo un delta che cambia un arco deve includere entrambi i nodi agli estremi.

`InitialModel` è la stessa informazione organizzata "per colonne", come codice del contratto del modello: `roleNames` e `roleAddresses`, più un array per ogni campo di `Node`, tutti della stessa lunghezza.

**Nascita dell'asset.** Il costruttore riceve, oltre a NMT e policy, l'indirizzo del contratto del modello: legge il codice (`model.code`), lo decodifica come `InitialModel` e scrive ruoli e nodi con `_setRoles` e `_setNodes`, senza controlli strutturali (il modello fa parte del tipo). Emette `ChoreographyInitialized(model)`. I ruoli nascono senza account: l'holder li collega con `setRoles`.

**Scrittura e ordine dei controlli:**

```mermaid
sequenceDiagram
  participant H as Holder
  participant A as ChoreographyMutableAsset
  participant C as CreatorSmartPolicy
  participant P as HolderSmartPolicy
  H->>A: setNodes(names, types, incoming, outgoing, ...)
  A->>C: evaluate(holder, action, asset)
  A->>P: evaluate(holder, action, asset)
  A->>C: evaluateNodeUpdate(asset, names, types, incoming, outgoing)
  C-->>A: legge lo stato corrente (getNodeNames, getNodeTypeAndEdges, ...)
  A->>P: evaluateNodeUpdate(stessa chiamata)
  A->>A: _setNodes: sovrascrive i nodi, emette NodesChanged
```

| Funzione | Controlli | Effetto |
| --- | --- | --- |
| `setRoles(names, addresses)` | Creator e Holder, poi `evaluateRoleUpdate` di Creator e Holder | Aggiunge o sovrascrive ruoli. Emette `RolesChanged`. |
| `setNodes(...)` (9 array paralleli) | Creator e Holder, poi `evaluateNodeUpdate` di Creator e Holder | Aggiunge o sovrascrive nodi completi. Emette `NodesChanged`. |
| `tokenURI()` | — | Restituisce `NMT.tokenURI(tokenId)`, lo stesso valore letto dall'NMT. |

| Lettura | Uso |
| --- | --- |
| `getNode(name)` | Tutti i campi di un nodo. La usa il renderer on-chain. |
| `getNodeNames()`, `getRoleNames()`, `getRole(name)`, `hasRole(name)` | Enumerazione. La usano il renderer on-chain, la Creator policy e i test. |
| `hasNode(name)`, `getNodeTypeAndOutgoing(name)`, `getNodeTypeAndEdges(name)` | Letture compatte per i controlli della Creator policy. |

### Policy della coreografia

| Policy | Stato interno | Decide |
| --- | --- | --- |
| `MasterSmartPolicy` | nessuno: regole **hardcoded**, come una policy tradotta da XACML (`administrator` e unico creator autorizzato = account 0, holder ammessi = account 0 e 1) | Operazioni dell'NMT: mint, mint con modello, trasferimenti, propria sostituzione (solo `administrator`). |
| `CreatorSmartPolicy` | nessuno: regole **hardcoded** (`administrator` = account 0) | Modifiche dell'holder e propria sostituzione (solo `administrator`). Nessun vincolo BPMN: rifiuta solo aggiornamenti malformati (array di lunghezze diverse, nomi vuoti o duplicati, sequence flow dichiarati su un solo estremo: nel modello dopo l'aggiornamento `B` sta in `A.outgoing` se e solo se `A` sta in `B.incoming`). Un modello così non si potrebbe più disegnare. |
| `ConstrainedCreatorSmartPolicy` (abstract) | `participants`: l'attribute manager, `immutable` dal costruttore | Le regole dei vincoli strutturali e dei ruoli. I dati (limiti, task ammessi, nodi e ruoli protetti, tipi richiesti) sono letterali scritti da ogni scenario: `CreatorSmartPolicyTestScenario` (fixture dei test) e `CreatorSmartPolicyPaperScenario` (paper example). |
| `ChoreographyParticipantAM` | `participantNmt`, `participantCertifier` (`immutable`) | Non è una policy ma un attribute manager: restituisce il tipo di una licenza emessa dal participant NMT e certificata dalla participant Creator policy, zero per ogni altro indirizzo. |
| `HolderSmartPolicy` | nessuno | Seconda approvazione: consente all'holder `setRoles`, `setNodes` e `setLinked`. Implementa `IChoreographyPolicy` senza vincoli: `evaluateNodeUpdate` ed `evaluateRoleUpdate` rispondono `true` senza leggere l'asset. |
| `DenyAllSmartPolicy` | nessuno | Nega tutto, anche i controlli di dominio (`IChoreographyPolicy`). Installata come Holder policy, blocca l'asset finché l'holder non la sostituisce. |

Come ogni policy, la Creator rappresenta una policy tradotta da XACML: le regole non si configurano a runtime, e un insieme diverso di vincoli è un'altra policy, installata con `setCreatorSmartPolicy` o passata al mint. Nelle policy vincolate `evaluateNodeUpdate` calcola il modello **dopo** l'aggiornamento: parte dai conteggi correnti e sostituisce i nodi con lo stesso nome. Rifiuta l'aggiornamento se:

- supera il numero massimo di task o di sequence flow;
- contiene nomi vuoti o duplicati, o un sequence flow dichiarato su un solo estremo (questi controlli li fa la `CreatorSmartPolicy` di default, da cui le policy vincolate ereditano);
- contiene un task fuori dall'allowlist;
- ha un estremo di `incoming` o `outgoing` sconosciuto;
- modifica un nodo protetto, oppure aggiunge o toglie un collegamento verso di esso.

`evaluateRoleUpdate` controlla chi può interpretare un ruolo. Rifiuta l'aggiornamento se:

- contiene nomi vuoti o duplicati, o un ruolo protetto che ha già un account (un ruolo protetto si assegna una sola volta);
- crea un ruolo nuovo: si possono solo riassegnare i ruoli esistenti;
- collega un ruolo con requisito a qualcosa che non è una licenza adatta: `ChoreographyParticipantAM` deve restituire per quell'indirizzo il tipo richiesto, cioè l'indirizzo deve essere un `ParticipantMutableAsset` emesso da `participantNmt` e certificato da `participantCertifier`;
- fa interpretare due ruoli allo stesso account, quando lo scenario lo richiede. Il controllo usa i ruoli dopo l'aggiornamento.

Il requisito si verifica quando il ruolo viene collegato; per ricontrollarlo basta simulare (`staticCall`) un `setRoles` che ricollega la stessa licenza. Allowlist e protezioni confrontano `keccak256(nome)` con costanti dello scenario.

La tabella completa di chi può fare cosa è in [Choreography policies](choreography-policies.md#who-can-do-what). La semantica dei vincoli e la corrispondenza con i test sono in [Policy test specification](policy-test-specification.md).

### `ChoreographyTokenURIRenderer`

**A cosa serve:** genera i metadati ERC-721 dell'asset leggendone lo stato. È un contratto senza stato, deployato una volta e condiviso da tutti gli asset di un NMT. È descritto in dettaglio in [Rendering](rendering.md#il-renderer-on-chain).

## Livello participant

Un `ParticipantMutableAsset` è la **licenza di un ruolo**. La coreografia collega il ruolo alla licenza una volta: `roles["Special Carrier"]` contiene l'indirizzo della licenza. La licenza resta collegata finché serve. L'organizzazione che interpreta il ruolo è l'holder della licenza, e cambia quando la licenza viene venduta con `transferFrom`: la coreografia non cambia.

| Contratto | Ruolo |
| --- | --- |
| `ParticipantNMT` | Conia le licenze con `mintWithParticipantType(to, creator, holder, tipo)`: il tipo è obbligatorio, e il `mint` senza tipo fallisce. Espone `tokenURI` tramite un `ParticipantTokenURIRenderer` fissato nel costruttore. |
| `ParticipantMasterSmartPolicy` | Valuta mint, transfer e sostituzione della Master (`setMasterSmartPolicy`, solo all'autorità) del `ParticipantNMT`. È **hardcoded**, come una policy tradotta da XACML: per ogni tipo (`SpecialCarrier`, `Carrier`, `Supplier`) scrive nel codice chi lo emette e quali organizzazioni sono qualificate. Una licenza si vende solo a un'organizzazione qualificata per il suo tipo. |
| `CreatorSmartPolicy` (participant) | Il suo `administrator` è il certificatore: solo lui sostituisce la Creator policy. All'holder consente solo le azioni elencate (`setName`, `setProfile`, `setMessages`, `setLinked`, `transferFrom`); ogni altra azione è negata. Con `evaluateMessagesUpdate` ammette solo i messaggi previsti per il tipo della licenza, scritti nel codice. |
| `HolderSmartPolicy` (participant) | Seconda approvazione: consente all'holder le stesse azioni sui propri dati, e nega tutto il resto. Su `evaluateMessagesUpdate` non aggiunge vincoli. |
| `ParticipantTokenURIRenderer` | Genera i metadati della licenza dallo stato: tipo, holder, nome, profilo, messaggi, chi li ha scritti e se è l'holder attuale. |

Le due policy negano per default: una funzione nuova della licenza resta bloccata finché non le si assegna esplicitamente un selettore. `test:policies` controlla che ogni funzione che modifica la licenza abbia una decisione esplicita.

Un transfer azzera la Holder policy della licenza e cancella nome e profilo del venditore; i messaggi restano, con l'indirizzo dell'holder che li ha scritti. Il nuovo holder installa una Holder policy con `setHolderSmartPolicy`, poi aggiorna i propri dati. Il vecchio holder perde ogni diritto sulla licenza. Le qualifiche contano al momento della vendita. Il design completo è in [Participant license design](participant-license-design.md).

`deploy:asset` assegna ancora ai ruoli gli account del nodo locale. Le licenze le usano per ora `test:policies` e l'esperimento (fasi F3 e F6, `npm run evidence:update`).

```solidity
bytes32 public immutable participantType; // tipo del ruolo, fissato al mint
bytes32 private name;                     // nome dell'organizzazione holder
bytes32 private profile;                  // hash o CID del profilo off-chain
address private messagesWriter;           // holder che ha scritto i messaggi
bytes32[] private messages;               // messaggi dichiarati
```

Ogni campo modificabile ha il suo setter (`setName`, `setProfile`, `setMessages`), che richiede entrambe le policy ed emette un evento dedicato (`NameChanged`, `ProfileChanged`, `MessagesChanged`). `setMessages` passa anche dal controllo di dominio `evaluateMessagesUpdate` di Creator e Holder. Come per le coreografie, il `tokenURI` è calcolato e mai salvato.

I nodi continuano a riferirsi ai ruoli per nome. Il ruolo si risolve nell'indirizzo della licenza:

```text
node.initiatorRole        = "Special Carrier"
roles["Special Carrier"]  = 0xLicenza        // ParticipantMutableAsset
ownerOf(0xLicenza)        = Carrier A → Carrier B dopo la vendita
```

Il render BPMN usa ancora i nomi dei ruoli come identità dei partecipanti. L'export address-first descritto in [Contract hierarchy](contract-hierarchy.md#target-design-participantmutableasset-address-as-identity) non è implementato.

## Componenti off-chain

| Componente | File | Cosa fa |
| --- | --- | --- |
| Importer BPMN | `bpmn-builder-js/scripts/import-bpmn.js` | Legge il BPMN con `bpmn-moddle` e produce un dataset NMT: un nodo per elemento di flusso, con nomi al posto degli ID. Riconosce i gateway convergenti (join) e rifiuta gli elementi non supportati. |
| Modello del tipo | `scripts/choreography-model.js` | Converte il dataset NMT in `InitialModel` (ruoli senza account), lo codifica ABI e ne fa il deploy come codice di un contratto dati (SSTORE2). |
| Delta | `scripts/apply-asset-delta.js` | Valida il delta, invia `setRoles` (se il delta ha `roles`) e `setNodes`, poi fa il render, salvo `--no-render`. |
| Render | `bpmn-builder-js/scripts/web3.js`, `bpmn-builder-js/src/`, `scripts/render-*.js` | Legge `tokenURI` e rigenera il BPMN. Vedi [Rendering](rendering.md). |
| Deploy | `scripts/deploy-local.js` | Importa il BPMN, deploya Master, Creator e Holder policy, il renderer, il contratto del modello e l'NMT, poi conia un'istanza e ne collega i ruoli agli account locali, in ordine: otto transazioni. |
| Valutazione | `scripts/experiment/`, `scripts/test-policies.js`, `scripts/evaluation/` | L'esperimento (specifica, esecuzione, generatori e controlli) misura gas e tempi delle fasi F1–F8 e scrive le evidenze versionate in `evaluation/evidence/`. `test-policies.js` verifica la matrice delle policy, e `scripts/evaluation/` contiene le metriche dei singoli comandi e il disegno chor-js. Vedi [il protocollo dell'esperimento](experiment.md) ed [Evaluation](../evaluation/README.md). |

### Formati dei dati

Il **dataset NMT** (`*.nmt.json`) è il formato di scambio tra importer, contratto e render. Ricalca direttamente `Node`:

```json
{
  "schemaVersion": "1.0",
  "id": "Choreography",
  "name": "paper-example",
  "roles": ["Bulk Buyer", "Manufacturer", "Middleman", "Supplier", "Special Carrier"],
  "nodes": [
    {
      "name": "Order",
      "nodeType": 2,
      "incoming": ["Event_0amsrvp"],
      "outgoing": ["Order Intermediate"],
      "conditions": [""],
      "initiatorRole": "Bulk Buyer",
      "participantRole": "Manufacturer",
      "initiatingMessage": "Message_1xwxfgh",
      "returnMessage": ""
    }
  ]
}
```

Il **delta** ha la stessa forma per i nodi, ma contiene solo quelli cambiati, più un blocco `render` con i metadati del BPMN da generare e, opzionalmente, `roles` come mappa nome → indirizzo. Le regole sono in [Delta updates and Solidity calls](delta-update-and-solidity-calls.md).

Il **`tokenURI`** restituisce ruoli e nodi nella stessa forma del dataset, con i ruoli come oggetti `{name, address}`. Vedi [Rendering](rendering.md#formato-dei-metadati).

## Confini di responsabilità

| Livello | Responsabilità | Non fa |
| --- | --- | --- |
| NMT | Possesso, creazione degli asset, punto d'accesso ai metadati | Non conserva il modello. |
| Asset | Persistenza del modello, applicazione delle modifiche | Non decide chi può modificare. |
| Policy | Autorizzazione e vincoli strutturali | Non conservano il modello. |
| Renderer on-chain | Serializza lo stato in JSON | Non scrive e non ha stato. |
| JavaScript | Conversione tra BPMN e NMT, invio delle transazioni, rigenerazione di XML e layout | Non è fonte di verità: lo è sempre l'asset. |

Grazie a questa separazione si può cambiare una policy senza toccare il formato del modello, cambiare il formato dei metadati deployando un nuovo renderer, e tenere off-chain la parte costosa del render (ID, layout, XML), mentre dati e regole di modifica restano on-chain.
