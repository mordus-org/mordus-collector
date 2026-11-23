# Transporte HTTP

`BatchManager` recebe somente eventos normalizados e filtrados pelo pipeline. A integração chama `start()` após autorizar a coleta e `stop()` no encerramento e no rollback de inicialização. O gerenciador implementa `MonitorTransport` e expõe `statistics`, com contagens sem conteúdo de eventos.

A fila FIFO inclui eventos em envio no limite `maxQueueSize`. Quando cheia, descarta o evento novo e incrementa `dropped`. Cada evento é serializado ao entrar, preservando seu conteúdo e `eventId` durante as retentativas. Os lotes respeitam `batchSize` e 60 KiB em UTF-8, incluindo o envelope. Eventos que excedem esse limite são descartados e contados.

O envio ocorre por tamanho, intervalo, `flush()` e `pagehide`. Há um pedido em trânsito por gerenciador. Todos os pedidos usam `fetch` com `keepalive`, credenciais omitidas, redirecionamentos bloqueados e ausência de referrer. O navegador pode rejeitar pedidos por quotas compartilhadas de keepalive. A saída da página oferece tentativa de envio e pode interromper a entrega.

Falhas de rede, timeout, HTTP 408, 429 e 5xx permitem até três tentativas por padrão, com espera exponencial iniciada em 1000 ms e limitada a 30 segundos. Outros status encerram o lote sem retentativa. Falhas finais incrementam `dropped`. O timeout padrão é 10 segundos. `stop()` cancela o pedido, libera timers/listeners e descarta pendências com contagem. Para tentar entregar pendências antes de parar, execute `await flush()` e depois `stop()`.

## Contrato de ingestão

O endpoint recebe `POST` JSON com o envelope `{ "events": MonitorEvent[] }` e `Content-Type: application/json`. Qualquer resposta 2xx confirma o lote inteiro. A ingestão deve aplicar a validação de schema e deduplicar por `(projectId, eventId)` atomicamente antes de confirmar. Uma resposta perdida pode causar reenvio de eventos que já foram persistidos. Respostas parciais por evento não fazem parte deste contrato.

Endpoints em outra origem precisam permitir CORS para POST e Content-Type. Credenciais de navegador não são enviadas. O endpoint deve definir sua autorização de ingestão compatível com esse contrato. A camada de transporte não transforma identificadores nem adiciona conteúdo do DOM.
