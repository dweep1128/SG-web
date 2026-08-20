const quote = new Map(JSON.parse(sessionStorage.getItem('sk-quote-list') || '[]'));
const drawer = document.querySelector('.enquiry-drawer');
const overlay = document.querySelector('.overlay');
const cartCount = document.querySelector('#cart-count');
const cartButton = document.querySelector('.cart-button');
const itemsContainer = document.querySelector('#enquiry-items');
const whatsappCheckout = document.querySelector('#whatsapp-checkout');

function setDrawer(open) { drawer.classList.toggle('open', open); overlay.classList.toggle('show', open); drawer.setAttribute('aria-hidden', String(!open)); }
function renderQuote() {
  const items = [...quote.entries()]; cartCount.textContent = items.reduce((total, [, quantity]) => total + quantity, 0);
  itemsContainer.innerHTML = items.length ? items.map(([name, quantity]) => `<div class="enquiry-line"><div><p>${name}</p><small>ADD QUANTITY FOR QUOTE</small></div><div class="quantity"><button type="button" data-action="remove" data-product="${name}" aria-label="Remove one ${name}">−</button><span>${quantity}</span><button type="button" data-action="add" data-product="${name}" aria-label="Add one ${name}">+</button></div></div>`).join('') : '<p class="empty-state">Your quote list is empty.<br />Add a part to get started.</p>';
  const message = items.length ? `Hello SK Traders, I would like a wholesale quote for these EV scooty parts:%0A%0A${items.map(([name, quantity], index) => `${index + 1}. ${name}%0A   Qty: ${quantity}`).join('%0A%0A')}%0A%0APlease share availability, dealer price, GST and delivery details.` : '';
  whatsappCheckout.href = `https://wa.me/919999999999?text=${message}`; whatsappCheckout.classList.toggle('ready', Boolean(items.length)); sessionStorage.setItem('sk-quote-list', JSON.stringify(items));
}
window.addToQuote = (product, quantity = 1) => { quote.set(product, (quote.get(product) || 0) + quantity); renderQuote(); setDrawer(true); };
function productCard(product) {
  const limited = product.stock === 'Limited stock';
  return `<article class="product-card" data-product-card data-search="${[product.name, product.sku, product.category, ...product.compatibility].join(' ').toLowerCase()}" data-compatibility="${product.compatibility.join('|')}"><a href="product.html?product=${product.id}" class="product-image product-photo"><span class="stock-tag ${limited ? 'limited' : ''}">${product.stock}</span><img src="${product.image}" alt="${product.name}" /></a><p class="sku">${product.sku}</p><a href="product.html?product=${product.id}"><h3>${product.name}</h3></a><p class="product-meta">${product.voltage} · MOQ ${product.moq}</p><p class="compatibility-tag">Fits: ${product.compatibility.join(', ')}</p><button class="add-button" data-product="${product.name}" type="button">Add to quote <span>+</span></button></article>`;
}
function installProductGrid() { const grid = document.querySelector('#product-grid'); if (!grid) return; grid.innerHTML = window.SK_PRODUCTS.map(productCard).join(''); grid.querySelectorAll('.add-button').forEach((button) => button.addEventListener('click', () => window.addToQuote(button.dataset.product))); }
itemsContainer.addEventListener('click', (event) => { const button = event.target.closest('button[data-action]'); if (!button) return; const product = button.dataset.product; const next = (quote.get(product) || 0) + (button.dataset.action === 'add' ? 1 : -1); if (next > 0) quote.set(product, next); else quote.delete(product); renderQuote(); });
cartButton.addEventListener('click', () => setDrawer(true)); document.querySelector('.close-drawer').addEventListener('click', () => setDrawer(false)); overlay.addEventListener('click', () => setDrawer(false));
const menuToggle = document.querySelector('.menu-toggle'); const menu = document.querySelector('#main-menu');
menuToggle.addEventListener('click', () => { const open = menu.classList.toggle('open'); menuToggle.setAttribute('aria-expanded', String(open)); menuToggle.textContent = open ? '×' : '☰'; });
menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => { menu.classList.remove('open'); menuToggle.setAttribute('aria-expanded', 'false'); menuToggle.textContent = '☰'; }));
const models = { Ola: ['S1 Pro', 'S1 Air'], Ather: ['450X', 'Rizta'], TVS: ['iQube'], Bajaj: ['Chetak'], Hero: ['Vida V1'], Universal: ['Universal fit'] };
const brandSelect = document.querySelector('#scooter-brand'); const modelSelect = document.querySelector('#scooter-model'); const searchInput = document.querySelector('#part-search'); const feedback = document.querySelector('#search-feedback');
function filterProducts(term = '', compatibility = '') { const cards = [...document.querySelectorAll('[data-product-card]')]; let matched = 0; cards.forEach((card) => { const match = card.dataset.search.includes(term.toLowerCase()) && (!compatibility || card.dataset.compatibility.includes(compatibility)); card.hidden = !match; if (match) matched += 1; }); if (feedback) feedback.textContent = term || compatibility ? `${matched} matching demo part${matched === 1 ? '' : 's'} shown below.` : ''; document.querySelector('#parts')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
if (brandSelect) { brandSelect.addEventListener('change', () => { const options = models[brandSelect.value] || []; modelSelect.disabled = !options.length; modelSelect.innerHTML = options.length ? `<option value="">Select model</option>${options.map((model) => `<option>${model}</option>`).join('')}` : '<option>Select a brand first</option>'; }); document.querySelector('#parts-finder').addEventListener('submit', (event) => { event.preventDefault(); filterProducts(searchInput.value.trim()); }); document.querySelector('#compatibility-search').addEventListener('click', () => filterProducts(searchInput.value.trim(), modelSelect.value || brandSelect.value)); }
const themeToggle = document.querySelector('.theme-toggle'); function setTheme(theme) { document.documentElement.dataset.theme = theme; localStorage.setItem('sk-theme', theme); themeToggle.querySelector('b').textContent = theme === 'dark' ? 'Light' : 'Dark'; themeToggle.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`); }
setTheme(localStorage.getItem('sk-theme') || 'light'); themeToggle.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
installProductGrid(); renderQuote();
