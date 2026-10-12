(async () => {
await window.CLOTHES_PRODUCTS_READY;
const searchProducts = window.CLOTHES_PRODUCTS || [];
const stylePages = [
  { name: 'Streetwear', slug: 'streetwear', image: 'https://thesinnersgallery.com/cdn/shop/files/IMG_7211copia.png?v=1745537111&width=2277' },
  { name: 'Old Money', slug: 'old-money', image: 'https://b2cmattelsa.vtexassets.com/arquivos/ids/747151-800-auto?aspect=true&height=auto&v=639247313895930000&width=800' },
  { name: 'Y2K', slug: 'y2k', image: 'https://b2cmattelsa.vtexassets.com/arquivos/ids/747847-800-auto?aspect=true&height=auto&v=639252798838930000&width=800' },
  { name: 'Minimalista', slug: 'minimalista', image: 'https://anewcross.com/cdn/shop/files/CAMISETAARMOURGRIS1_453c34e9-bd4c-44e3-87dd-b2551bd43e4b.jpg?v=1693948423&width=800' },
  { name: 'Vintage', slug: 'vintage', image: 'https://loborosa.com/wp-content/uploads/2024/01/1251084_Ciara-Dress_1-600x750.jpg' },
  { name: 'Casual', slug: 'casual', image: 'https://loborosa.com/wp-content/uploads/2024/01/1251084_Ciara-Dress_1-600x750.jpg' },
  { name: 'Formal', slug: 'formal', image: 'https://baobab.com.co/cdn/shop/files/BAOBABCOMSEP2527002_f02e4dd0-403f-4cda-9d35-48c1f51a453e.webp?v=1759409222&width=800' },
  { name: 'Techwear', slug: 'techwear', image: 'https://trueshop.co/cdn/shop/files/Racing-Camo-Carpenter-Pants---Green_1_1_24e35652-e1ad-4100-b3b8-592359037524_1200x1200.jpg?v=1771273910' }
];
const demoBrands = [
  { name: 'Savage', logo: '../Imagenes/Marcas/Savage/savage_logo.png', note: 'Marca colombiana incluida en el catálogo.', url: '' },
  { name: 'True', logo: '../Imagenes/Marcas/True/true_logo.png', note: 'Marca colombiana incluida en el catálogo.', url: '' },
  { name: 'Undergold', logo: '../Imagenes/Marcas/Undergold/undergold_logo.png', note: 'Marca colombiana incluida en el catálogo.', url: '' },
  { name: 'Weedgreen', logo: '../Imagenes/Marcas/Weedgreen/weedgreen_logo.png', note: 'Marca colombiana incluida en el catálogo.', url: '' },
  { name: 'Buds', logo: '../Imagenes/Marcas/Buds/BUDS_LOGO.webp', note: 'Marca colombiana de ropa urbana; consulta su catálogo oficial antes de comprar.', url: 'https://www.buds.com.co/' },
  { name: 'ZIPRE', logo: '../Imagenes/Marcas/Zipre/Zipre-logo.webp', note: 'Marca de moda sostenible con base en Bogotá y prendas hechas en Colombia.', url: 'https://zipre.co/' },
  { name: 'Kame.col', logo: '../Imagenes/Marcas/Kame-col/Kame-col-logo.png', note: 'Marca de ropa urbana de Bogotá con confección colombiana.', url: 'https://www.kamecol.com/' },
  { name: 'SINNERS', logo: '../Imagenes/Marcas/Sinners/sinners_logo_negro.avif', note: 'Streetwear diseñado y fabricado en Medellín; consulta tallas y disponibilidad en su tienda oficial.', url: 'https://thesinnersgallery.com/' },
  { name: 'Mattelsa', logo: '', note: 'Ropa urbana colombiana para hombre y mujer.', url: 'https://www.mattelsa.net/' },
  { name: 'Homen', logo: '', note: 'Marca colombiana de prendas premium, algodón de alto gramaje y siluetas urbanas.', url: 'https://www.homen.com.co/' },
  { name: 'A New Cross', logo: '', note: 'Marca de diseño y confección artesanal con sede en Bogotá.', url: 'https://anewcross.com/' },
  { name: 'Agua Bendita', logo: '', note: 'Marca colombiana de swimwear, resort y prendas con detalles artesanales.', url: 'https://www.aguabendita.com.co/' },
  { name: 'Baobab', logo: '', note: 'Marca colombiana de prendas resort y tejidos de diseño.', url: 'https://baobab.com.co/' },
  { name: 'Suki Cohen', logo: '', note: 'Marca colombiana de ropa interior, bodies y prendas femeninas.', url: 'https://sukicohen.com/' },
  { name: 'Maygel Coronel', logo: '', note: 'Diseño colombiano de vestidos, swimwear y prendas resort.', url: 'https://co.maygelcoronel.com/' },
  { name: 'Lobo Rosa', logo: '', note: 'Marca colombiana de ropa femenina y vestidos estampados.', url: 'https://loborosa.com/' },
  { name: 'Low Trip', logo: '', note: 'Streetwear colombiano diseñado en Bogotá; el catálogo conserva la clasificación de audiencia indicada por la marca.', url: 'https://lowtripstudios.com/' },
  { name: 'Agybo', logo: '', note: 'Marca colombiana de prendas urbanas y tejidos de punto; los productos sin género explícito se clasifican como unisex.', url: 'https://agybo.com/' },
  { name: 'Zohet', logo: '', note: 'Marca colombiana de ropa femenina con tienda y puntos físicos en Bogotá.', url: 'https://zohet.com.co/' },
  { name: 'One Five', logo: '', note: 'Marca colombiana de vestuario femenino con sede en Medellín.', url: 'https://www.onefive.com.co/' }
];
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const audienceLabel = value => ({ mujer: 'Mujer', hombre: 'Hombre', unisex: 'Unisex' })[value] || 'Unisex';
const brandHost = document.getElementById('brandGrid');
if (brandHost) {
  brandHost.innerHTML = demoBrands.map((brand, index) => {
    const products = searchProducts.filter(product => product.brand === brand.name);
    const preview = products[0];
    return `<article class="brand-directory-card"><a href="./buscar.html?q=${encodeURIComponent(brand.name)}" class="brand-image">${preview ? `<img src="${preview.image}" alt="Prenda de ${esc(brand.name)}" loading="lazy">` : `<span class="brand-image-placeholder">${esc(brand.name)}</span>`}<span>0${index + 1} / MARCA COLOMBIANA</span></a><div class="brand-directory-info">${brand.logo ? `<img class="brand-directory-logo" src="${brand.logo}" alt="" loading="lazy">` : ''}<h2>${brand.name}</h2><p>${esc(brand.note)}</p><div class="brand-facts"><span>Categorías: ${[...new Set(products.map(product => product.category))].join(' · ') || 'Vestuario'}</span><span>Estilos: ${[...new Set(products.flatMap(product => product.styles))].join(' · ') || 'Por descubrir'}</span><span>${products.length} ${products.length === 1 ? 'prenda' : 'prendas'}</span>${brand.url ? `<span>Canal oficial: <a href="${brand.url}" target="_blank" rel="noopener noreferrer">visitar marca</a></span>` : ''}</div><a class="text-link" href="./buscar.html?q=${encodeURIComponent(brand.name)}">Explorar prendas <i class="fa-solid fa-arrow-right ms-2" aria-hidden="true"></i></a></div></article>`;
  }).join('');
}

const searchInput = document.getElementById('globalSearch');
const resultsHost = document.getElementById('searchResults');
if (searchInput && resultsHost) {
  const params = new URLSearchParams(window.location.search);
  searchInput.value = params.get('q') || '';
  const styles = stylePages;
  const productPage = product => product.audience === 'mujer' ? 'ropa_mujer.html' : product.audience === 'hombre' ? 'ropa_hombre.html' : 'unisex.html';
  const formatPrice = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
  function renderSearch() {
    const query = searchInput.value.trim().toLocaleLowerCase('es');
    const words = query.split(/\s+/).filter(Boolean);
    const matches = value => words.every(word => value.toLocaleLowerCase('es').includes(word));
    const products = searchProducts.filter(product => matches(`${product.name} ${product.brand} ${product.category} ${product.styles.join(' ')}`));
    const brands = demoBrands.filter(brand => matches(`${brand.name} marca`));
    const matchedStyles = styles.filter(style => matches(style.name));
    const categories = [...new Set(searchProducts.map(product => product.category))].filter(category => matches(category));
    document.getElementById('searchSummary').textContent = query ? `${products.length + brands.length + matchedStyles.length + categories.length} resultados para “${searchInput.value.trim()}”.` : 'Busca prendas, marcas, estilos o categorías.';
    if (!query) {
      resultsHost.innerHTML = `<section class="search-group"><h2>Marcas para descubrir</h2><div class="search-brand-list">${demoBrands.map(brand => `<a href="./buscar.html?q=${encodeURIComponent(brand.name)}">${brand.logo ? `<img src="${brand.logo}" alt="" loading="lazy">` : ''}<span>${brand.name}</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>`).join('')}</div></section><section class="search-group"><h2>Explora estilos</h2><div class="search-style-list">${styles.map(style => `<a href="./estilo_${style.slug}.html">${style.name}<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>`).join('')}</div></section>`;
      return;
    }
    const brandResults = brands.map(brand => `<a class="search-brand-result" href="./buscar.html?q=${encodeURIComponent(brand.name)}">${brand.logo ? `<img src="${brand.logo}" alt="" loading="lazy">` : ''}<span>Marca · ${brand.name}</span><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>`).join('');
    const styleResults = matchedStyles.map(style => `<a class="search-style-result" href="./estilo_${style.slug}.html"><span>Estilo</span><strong>${style.name}</strong><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>`).join('');
    const categoryResults = categories.map(category => `<a class="search-style-result" href="./ropa_hombre.html?q=${encodeURIComponent(category)}"><span>Categoría</span><strong>${category}</strong><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>`).join('');
    const productResults = products.map(product => `<article class="search-product"><a href="./${productPage(product)}?q=${encodeURIComponent(product.name)}" class="search-product-image"><img src="${product.image}" alt="${esc(product.name)} de ${esc(product.brand)}" loading="lazy"></a><div>${product.logo ? `<img class="search-product-logo" src="${product.logo}" alt="" loading="lazy">` : ''}<h3>${esc(product.name)}</h3><p>${esc(product.brand)} · ${esc(product.category)} · ${audienceLabel(product.audience)}</p><span>${formatPrice(product.price)} <small>${product.priceCurrencyOriginal ? 'COP aproximados desde EUR' : product.source === 'muestra' ? 'precio referencial' : 'precio consultado; puede cambiar'}</small></span>${product.officialUrl ? `<a class="text-link" href="${product.officialUrl}" target="_blank" rel="noopener noreferrer">Ver en tienda oficial</a>` : ''}</div></article>`).join('');
    resultsHost.innerHTML = `${brandResults || styleResults || categoryResults ? `<section class="search-group"><h2>Marcas, estilos y categorías</h2><div class="search-quick-results">${brandResults}${styleResults}${categoryResults}</div></section>` : ''}${productResults ? `<section class="search-group"><h2>Prendas <span>${products.length}</span></h2><div class="search-product-grid">${productResults}</div></section>` : ''}${!brandResults && !styleResults && !categoryResults && !productResults ? '<p class="catalog-empty">No encontramos resultados. Prueba con otra palabra.</p>' : ''}`;
  }
  searchInput.addEventListener('input', renderSearch);
  renderSearch();
}
})();
