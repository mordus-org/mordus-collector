export function createElementFixture(): void {
  document.body.innerHTML = `
    <button data-monitor="checkout.submit"><span><svg id="icon"></svg></span></button>
    <section data-monitor="product:123">
      <button data-monitor="add-to-cart" id="first-product"></button>
    </section>
    <section data-monitor="product:456">
      <button data-monitor="add-to-cart" id="second-product"></button>
    </section>
    <section data-monitor-ignore>
      <button data-monitor="ignored" id="ignored"></button>
    </section>
    <div id="dynamic-root"></div>
  `;
}
