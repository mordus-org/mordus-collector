# Argus

SDK de monitoramento para aplicações web, em TypeScript e independente de frameworks.

O SDK oferece contratos, configuração validada e ciclo de vida (`start`, `stop`, `track` e `flush`). Instanciar o SDK mantém a coleta desabilitada. Em ambientes com DOM, os coletores de cliques, campos e formulários ficam disponíveis após habilitar a coleta e chamar `start()`.

## Instalação e integração

Instale o pacote em uma aplicação com Node.js 22.12+ ou 24+ durante o desenvolvimento. O código distribuído é ESM, inclui declarações TypeScript e não requer dependências de runtime.

```sh
npm install @argus/monitor
```

Depois de confirmar a finalidade e a base legal aplicável, habilite a coleta. Quando a base for consentimento, chame `start()` somente após obtê-lo.

```ts
import { createMonitor } from '@argus/monitor';

const monitor = createMonitor({
  projectId: 'my-app',
  endpoint: '/api/monitor/events',
  collectionEnabled: true,
});

await monitor.start();
monitor.track('cart.item_added', { product: 'sku_123' });

// Ao retirar a autorização, encerre a coleta e descarte a fila pendente.
monitor.setCollectionEnabled(false);
```

Marque controles elegíveis com `data-monitor="identificador.estavel"` e regiões excluídas com `data-monitor-ignore`. Use identificadores opacos sem dados pessoais. O [exemplo HTML](examples/vanilla-app/index.html) mostra a integração sem framework. A [aplicação SPA](examples/shopping-app/index.html) demonstra navegação, controles dinâmicos e formulário. O endpoint recebe `{ "events": MonitorEvent[] }`, confirma lotes com status 2xx e deve deduplicar `(projectId, eventId)`. Consulte o [contrato HTTP](src/transport/README.md).

O SDK omite valores digitados, texto e HTML dos eventos automáticos. Metadados manuais passam por limites e filtros, mas a integração deve enviar apenas códigos sem dados pessoais. A revogação descarta a fila local e aborta tentativas pendentes. Uma requisição já recebida pelo servidor pode ter sido processada. Erros 4xx permanentes encerram o lote, enquanto falhas transitórias recebem retentativas limitadas. `monitor.diagnostics` informa contagens e códigos de descarte sem incluir conteúdo dos eventos.

## Desenvolvimento

Use Node.js 22.12 ou superior da série 22, ou Node.js 24 ou superior.

```sh
npm install
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
npm run test:distribution
npx playwright install chromium
npm run test:e2e
npm run example
```

O exemplo fica em `http://127.0.0.1:4173`. O import map aponta o nome público `@argus/monitor` ao bundle ESM construído em `dist/`. O runtime não exige dependências externas.

```ts
import { createMonitor } from '@argus/monitor';

const monitor = createMonitor({
  projectId: 'my-app',
  endpoint: '/api/monitor/events',
});
```

Os testes unitários usam Node.js, os testes de interação isolada usam jsdom e as jornadas usam Chromium via Playwright. Os contratos negativos em `*.test-d.ts` são verificados por `npm run typecheck`.

## Contratos

`MonitorConfig` descreve projeto, endpoint e opções de captura/transporte. O núcleo valida a configuração e cria uma cópia imutável. Os valores padrão são `data-monitor`, todas as opções de captura habilitadas e transporte com lotes de 20 eventos, intervalo de 5000 ms e limite de 1000 eventos. O transporte padrão aplica esses limites ao envio HTTP em lotes.

`collectionEnabled` começa como `false`. A integração só deve fornecer `true` após confirmar a base legal aplicável e obter consentimento quando exigido. `monitor.setCollectionEnabled(false)` revoga a coleta, encerra os coletores, remove a identidade em memória e limpa o transporte padrão, abortando tentativas pendentes. `monitor.setCollectionEnabled(true)` habilita um novo ciclo, iniciado por `start()`. O getter `collectionEnabled` expõe o estado atual, e `config.collectionEnabled` preserva a configuração inicial. Um pedido já recebido pelo servidor pode ter sido processado antes do aborto.

`state` expõe `idle`, `starting`, `running`, `stopping` ou `stopped`. Chamadas repetidas a `start()` e `stop()` são idempotentes. O monitor libera os coletores no encerramento, ignora callbacks de ciclos anteriores e permite reiniciar. Falhas de inicialização desfazem os recursos já adquiridos. Falhas de limpeza são tentadas novamente antes de permitir outro início.

O segundo argumento de `createMonitor` aceita relógio, gerador de IDs, transporte e registros de coletores. Um registro recebe o pipeline único e informa a opção de captura correspondente. Fornecer `collectors` substitui os coletores padrão, permitindo testes isolados. `flush()` agrupa chamadas concorrentes e contém falhas do transporte. `track()` só processa eventos durante um ciclo ativo e autorizado.

`MonitorEvent` contém `schemaVersion`, `eventId`, `category`, `type`, `timestamp`, `projectId`, `sessionId`, `source` e `page`. O timestamp usa ISO 8601 em UTC. `element` e `metadata` são opcionais. A interface descreve eventos processados. A validação de objetos recebidos em runtime pertence ao pipeline.

| Categoria | Tipos automáticos                                       |
| --------- | ------------------------------------------------------- |
| `element` | `element.click`                                         |
| `field`   | `field.change`, `field.selection`                       |
| `form`    | `form.submit`, `form.reset`                             |
| `page`    | `page.view`                                             |
| `error`   | `error.javascript`, `error.unhandledrejection`          |
| `custom`  | Nomes definidos pela integração, como `cart.item_added` |

Eventos manuais usam `source: 'manual'` e categoria `custom`. O campo `type` preserva o nome informado pela integração. `AUTOMATIC_EVENT_TYPES` e `EVENT_CATEGORIES` publicam o vocabulário inicial. A correspondência entre categoria, tipo e origem será validada no pipeline.

`Collector` define `start()` e `stop()`. `EventPipeline.process()` recebe `RawMonitorEvent` para enriquecimento, filtragem e validação. Somente eventos processados chegam a `EventSink.emit()`. Um transporte injetado implementa `emit()` e `flush()`, permitindo um sink em memória nas etapas intermediárias.

O processador filtra metadados e copia os campos semânticos validados dos descritores automáticos. Identificadores de elemento começam com letra, têm até 128 caracteres e aceitam letras, números, pontos, dois-pontos, sublinhados e hífens. Caminhos têm até 16 identificadores. Os nomes manuais seguem o mesmo limite, com segmentos separados por ponto, sublinhado ou hífen. Esses limites validam a forma, e a integração deve usar identificadores sem dados pessoais.

Com navegação habilitada, `page.path` acompanha o caminho sanitizado atual. Com navegação desabilitada, o contexto usa `/`. A sessão usa `sessionStorage` por projeto e aba, com fallback em memória. O transporte padrão envia os eventos filtrados em lotes HTTP. Execute `await flush()` antes de `stop()` para tentar entregar a fila. `stop()` descarta pendências e encerra recursos. O contrato de ingestão e as retentativas estão em [Transporte HTTP](src/transport/README.md).

Os descritores de elemento incluem apenas identificador lógico, caminho de identificadores e tag. Valores digitados, texto e HTML ficam fora desse contrato. A integração deve confirmar a base legal e obter consentimento quando aplicável antes de habilitar a coleta nas próximas etapas.

Campos de texto geram `field.change` ao confirmar a alteração ou sair do campo, sem evento por tecla. Seleções em `select`, checkbox e radio geram `field.selection`. Formulários identificados geram `form.submit` e `form.reset` nas ações correspondentes. O coletor de campos ignora password, hidden, file, controles com nomes ou identificadores de token e segredo, e regiões `contenteditable`. A coleta de formulários descreve apenas a ação sem consultar valores de campos, inclusive quando o formulário contém um campo sensível. Campos e formulários sem identificação elegível ou dentro de `data-monitor-ignore` são descartados.

As regras de resolução, contextos aninhados e limites de Shadow DOM e iframes estão em [Identificação de elementos](docs/identificacao-de-elementos.md).

## Versionamento

O pacote adota SemVer. Enquanto a versão principal for zero, mudanças incompatíveis de API incrementam a versão menor. A partir de 1.0.0, incrementam a versão principal. Correções compatíveis incrementam patch e adições compatíveis incrementam minor.

O schema tem versão independente, inicialmente `SCHEMA_VERSION = 1`. Campos opcionais adicionais preservam essa versão. Remover ou renomear campos, alterar seus tipos ou significado, tornar campos obrigatórios e ampliar categorias/tipos fechados exigem incrementar `schemaVersion` e atualizar os consumidores antes da coleta. Alterações incompatíveis de API ou schema devem ser registradas no changelog de release e em commits com `!` e rodapé `BREAKING CHANGE:`.

### Navegação

Com `capture.navigation` habilitado, o monitor emite `page.view` inicial e
transições por History API, voltar/avançar e rotas hash `#/route`. Âncoras comuns
não representam novas páginas. Query strings são removidas e segmentos suspeitos
são redigidos. A filtragem por formato tem limites, portanto use caminhos e templates
sem dados pessoais. `monitor.notifyRoute('/products/:id')` atualiza a rota lógica
da página corrente sem emitir novamente uma transição já capturada pela History API.
O contexto sanitizado acompanha também os eventos de interação e os eventos manuais.
Os wrappers são compartilhados entre monitores e restaurados quando o último para.

### Sessão e identidade

A sessão é resolvida no primeiro `start()` autorizado. Monitores do mesmo projeto no mesmo documento compartilham o ID. Recarregar a aba preserva o ID quando `sessionStorage` está disponível, e `stop()` conserva a sessão para reinício. O fechamento da aba encerra o armazenamento de sessão conforme o navegador. Quando o storage falha, o ID permanece estável em memória durante o documento.

Uma aba aberta com `opener` acessível renova um ID copiado da aba de origem. A duplicação de abas sem `opener` e a cópia de storage com opener inacessível podem preservar o mesmo ID, pois o navegador não oferece um sinal síncrono confiável para distinguir esses casos de uma recarga. Use abas independentes ou links com `rel="noopener"` quando o isolamento for necessário.

`monitor.identify('opaque-user-id')` associa um identificador opcional aos próximos eventos e retorna `false` quando a coleta está desabilitada ou o formato é inválido. `monitor.resetIdentity()` remove a identidade dos próximos eventos. O `userId` fica somente na memória da instância e é independente de `sessionId` e dos identificadores dos elementos. Use IDs opacos de até 128 caracteres contendo letras, números, sublinhados ou hífens. A validação de formato não determina se um ID contém dados pessoais, e a integração continua responsável pela finalidade e autorização aplicáveis.

### Eventos manuais e erros

`track('cart.item_added', { source: 'page' })` usa o mesmo pipeline e contexto dos coletores. Metadados aceitam objetos planos, arrays, booleanos, números finitos, `null` e strings semânticas de até 128 caracteres, iniciadas por letra e compostas de letras, números, ponto, dois-pontos, sublinhado ou hífen. Strings fora desse formato são omitidas. Chaves associadas a senha, token, email, valores, texto, HTML e conteúdo são removidas sem executar getters. Use apenas códigos sem dados pessoais, pois o formato sozinho não identifica todo conteúdo pessoal.

Os limites são profundidade de quatro níveis abaixo da raiz, 100 entradas totais e orçamento de 8192 bytes computado durante a cópia. Ciclos, acessores em campos permitidos, tipos não JSON e limites excedidos descartam o evento. A cópia é independente da entrada.

Com `capture.errors`, erros JavaScript e rejeições não tratadas geram eventos automáticos. A mensagem é normalizada pela classe conhecida do erro. A stack é reconstruída com até oito localizações HTTP(S), sem texto de erro, nomes de função, origem, credenciais, query ou fragmento. Caminhos locais e linhas desconhecidas são omitidos. A sanitização de caminhos possui os limites descritos na navegação. O pipeline valida novamente os campos dos erros, inclusive de coletores injetados, antes do destino. Falhas e chamadas reentrantes no destino são contidas para evitar recursão do SDK.

### Pipeline e diagnósticos

`EventFactory` monta o envelope contextual. O filtro de privacidade executa antes da validação estrutural e da entrega ao destino. `EventValidator` verifica versão, categoria, origem, identificadores, timestamp, página, elemento e conteúdo JSON, com orçamento total de 16 KiB. A cópia rejeita acessores, objetos não JSON e ciclos sem executar `toJSON`. O estado autorizado e a geração do ciclo são conferidos novamente antes do destino.

`monitor.diagnostics` retorna uma cópia dos contadores. `emitted` conta eventos entregues ao sink, e os códigos de descarte são `unauthorized`, `invalid_event`, `invalid_metadata`, `reentrant`, `processing_error` e `transport_error`. Os contadores não contêm valores de eventos nem mensagens de exceção. A confirmação HTTP pertence às estatísticas do transporte.

Transportes injetados podem implementar `start()`, `stop()` e `clear()`. A implementação deve liberar timers e listeners, cancelar pedidos e retentativas e descartar dados retidos em `stop()`/`clear()` para respeitar a revogação. A API síncrona de `emit()` recebe apenas eventos já filtrados e validados.

`monitor.transportStatistics` retorna uma cópia dos contadores do transporte. `queued` inclui eventos em envio, `delivered` conta eventos confirmados por HTTP, `dropped` registra descartes, `failures` conta tentativas com falha e `retries` conta retentativas. A leitura expõe somente essas contagens. Para transportes injetados, o getter retorna `undefined` quando `statistics` está ausente, lança uma exceção ou contém contagens inválidas. Um transporte próprio pode fornecer `statistics` conforme o tipo público `TransportStatistics`.
