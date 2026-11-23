# Jornada de compra

O exemplo percorre início, lista, detalhe, carrinho e formulário em uma SPA. O monitor inicia com coleta habilitada apenas para a jornada de teste. Uma integração real deve confirmar sua base legal e, quando aplicável, obter consentimento antes de habilitar a coleta.

O servidor em `scripts/serve-shopping.mjs` recebe lotes em `/api/monitor/events`, deduplica por projeto e `eventId`, e permite consultar eventos via `GET` na mesma rota. Ele usa armazenamento em memória para testes.

A jornada mede a maior duração da lógica síncrona de cada ação em `demoMetrics.longestActionMs`. O teste usa 100 ms como limite para esta pequena página de exemplo. Também compara a contagem de listeners antes e depois de iniciar e parar outra instância e reiniciar o monitor principal. Essas medidas verificam a fixture local, sem representar um benchmark de produção.
