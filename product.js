const productId = new URLSearchParams(location.search).get('product');
const product = window.SK_PRODUCTS.find((item) => item.id === productId) || window.SK_PRODUCTS[0];
document.title = `${product.name} | SK Traders`;
document.querySelector('#product-page').innerHTML = `
  <section class="product-detail">
    <p class="breadcrumbs"><a href="index.html">Home</a><span> / </span><a href="index.html#parts">Parts</a><span> / </span>${product.category}</p>
    <div class="detail-grid"><div class="detail-image"><span class="stock-tag ${product.stock === 'Limited stock' ? 'limited' : ''}">${product.stock}</span><img src="${product.image}" alt="${product.name}" /></div>
      <div class="detail-copy"><p class="eyebrow"><span></span> ${product.category}</p><h1>${product.name}</h1><p class="detail-sku">SKU: ${product.sku}</p><p class="detail-description">A representative catalogue item for the SK Traders demo. Confirm final specs, fitment and dealer pricing with the sales team.</p>
      <div class="detail-highlights"><div><span>MOQ</span><b>${product.moq}</b></div><div><span>Stock</span><b>${product.stock}</b></div><div><span>Dispatch</span><b>Pan-India</b></div></div>
      <div class="product-action-row"><div class="detail-quantity"><button type="button" data-detail-quantity="-">−</button><output id="detail-quantity">1</output><button type="button" data-detail-quantity="+">+</button></div><button class="button button-primary detail-add" data-product="${product.name}" type="button">Add to quote list <span>+</span></button></div><a class="ask-product" target="_blank" rel="noreferrer" href="https://wa.me/919999999999?text=Hello%20SK%20Traders%2C%20I%20want%20to%20enquire%20about%20${encodeURIComponent(product.name)}%20%28${product.sku}%29.">Ask about this part on WhatsApp <span>↗</span></a></div>
    </div>
  </section>
  <section class="spec-section"><div><p class="eyebrow"><span></span> PART SPECIFICATIONS</p><h2>Details that help<br />you order right.</h2></div><dl class="spec-list"><div><dt>Part name</dt><dd>${product.name}</dd></div><div><dt>SKU / part number</dt><dd>${product.sku}</dd></div><div><dt>Electrical specification</dt><dd>${product.voltage}</dd></div><div><dt>Compatible with</dt><dd>${product.compatibility.join(', ')}</dd></div><div><dt>Minimum order quantity</dt><dd>${product.moq}</dd></div><div><dt>Price</dt><dd>Request dealer quote</dd></div></dl></section>`;
let detailQuantity = 1;
document.querySelectorAll('[data-detail-quantity]').forEach((button) => button.addEventListener('click', () => { detailQuantity = Math.max(1, detailQuantity + (button.dataset.detailQuantity === '+' ? 1 : -1)); document.querySelector('#detail-quantity').value = detailQuantity; }));
document.querySelector('.detail-add').addEventListener('click', () => window.addToQuote(product.name, detailQuantity));
