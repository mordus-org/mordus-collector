/* global document, window, history, location, performance */
import { createMonitor } from '@argus/monitor';

const app = document.querySelector('#app');
const monitor = createMonitor({
  projectId: 'shopping-example',
  endpoint: '/api/monitor/events',
  collectionEnabled: true,
  transport: { batchSize: 50, flushIntervalMs: 60000, maxQueueSize: 200 },
});

window.demoMonitor = monitor;
window.demoMetrics = { actions: 0, longestActionMs: 0 };

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

function render() {
  const path = location.pathname;

  if (path === '/products') {
    app.innerHTML =
      '<h1>Produtos</h1><div data-monitor="product.catalog"><button data-monitor="product.open" id="product"><span>Ver produto</span></button></div>';
  } else if (path === '/product') {
    app.innerHTML =
      '<h1>Detalhe</h1><div data-monitor="product.example"><button data-monitor="cart.add" id="add"><span>Adicionar ao carrinho</span></button></div>';
  } else if (path === '/cart') {
    app.innerHTML =
      '<h1>Carrinho</h1><button data-monitor="checkout.open" id="checkout">Continuar</button>';
  } else if (path === '/checkout') {
    app.innerHTML =
      '<h1>Finalizar</h1><form data-monitor="checkout.form" id="order"><input data-monitor="checkout.note" id="note" aria-label="Observação"><input data-monitor="checkout.password" type="password" id="password" aria-label="Senha"><button data-monitor="checkout.submit" type="submit">Enviar pedido</button></form>';
  } else {
    app.innerHTML =
      '<h1>Início</h1><button data-monitor="shop.products" id="products">Ver produtos</button>';
  }
}

document.addEventListener('click', (event) => {
  const startedAt = performance.now();
  const button = event.target.closest('button');
  const destinations = {
    home: '/',
    products: '/products',
    product: '/product',
    add: '/cart',
    checkout: '/checkout',
  };
  const destination = destinations[button?.id];

  if (!destination) return;

  window.demoMetrics.actions += 1;
  if (button.id === 'add')
    monitor.track('cart.item_added', { source: 'product' });
  navigate(destination);
  window.demoMetrics.longestActionMs = Math.max(
    window.demoMetrics.longestActionMs,
    performance.now() - startedAt,
  );
});

document.addEventListener('submit', (event) => {
  const startedAt = performance.now();
  if (event.target.id !== 'order') return;

  event.preventDefault();
  window.demoMetrics.actions += 1;
  monitor.track('checkout.completed', { source: 'form' });
  app.innerHTML = '<h1>Pedido recebido</h1>';
  window.demoMetrics.longestActionMs = Math.max(
    window.demoMetrics.longestActionMs,
    performance.now() - startedAt,
  );
});

window.addEventListener('popstate', render);
render();
monitor.start();
