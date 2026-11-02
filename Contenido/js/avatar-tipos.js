/* Clasifica cada prenda del inventario en una forma que el avatar sabe vestir.
   Lo usan el armario del probador (para saber qué prendas se reemplazan) y el avatar 3D. */
(() => {
  const normalize = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es');

  function topSpec(category, has) {
    const sleeveFromName = fallback => has('manga larga', 'long sleeve', 'longsleeve') ? 'long'
      : has('manga corta') ? 'short' : has('sin manga', 'tank', 'esqueleto', 'camisilla', 'musculosa') ? 'none' : fallback;
    if (['tops de bikini', 'top de bikini', 'bras', 'bra'].includes(category)) return { kind: 'bikini', sleeve: 'none' };
    if (['hoodies', 'hoodie'].includes(category) || ((category === 'buzos' || category === 'chaquetas') && has('hoodie', 'capota', 'capucha', 'hood'))) {
      return { kind: 'hoodie', sleeve: 'long', crop: has('crop', 'boxy'), oversize: has('oversize', 'boxy', 'relaxed') };
    }
    if (['buzos', 'sueteres', 'sweaters', 'cardigans', 'sudaderas'].includes(category)) {
      return { kind: 'sweater', sleeve: sleeveFromName('long'), crop: has('crop'), oversize: has('oversize', 'boxy') };
    }
    if (['chaquetas', 'sacos', 'chalecos', 'blazers'].includes(category)) {
      return { kind: 'jacket', sleeve: category === 'chalecos' || has('chaleco') ? 'none' : 'long', crop: has('crop', 'bomber corta') };
    }
    if (['camisas', 'blusas'].includes(category)) return { kind: 'shirt', sleeve: sleeveFromName(category === 'blusas' ? 'short' : 'long'), crop: has('crop') };
    if (['tops', 'crop tops', 'crop top'].includes(category)) return { kind: 'tee', sleeve: sleeveFromName(has('baby tee', 'camiseta') ? 'short' : 'none'), crop: true, fitted: true };
    if (['camisetas', 'camisetas oversize', 'polos', 'camisillas'].includes(category)) {
      return { kind: 'tee', sleeve: sleeveFromName('short'), crop: has('crop'), oversize: has('oversize', 'boxy', 'baggy'), fitted: has('slim', 'rib', 'baby tee', 'ajustad') };
    }
    return null;
  }

  function bottomSpec(category, has) {
    if (['bottom de bikini', 'bottoms de bikini', 'panty de bikini'].includes(category)) return { kind: 'bikini' };
    if (['faldas', 'falda', 'pareos'].includes(category)) {
      const length = has('mini') ? 'mini' : has('midi') ? 'midi' : has('larga', 'maxi', 'long') ? 'maxi' : category === 'pareos' ? 'midi' : 'knee';
      return { kind: 'skirt', length, flare: has('plisada', 'circular', 'volante', 'campana') ? 0.5 : 0.25 };
    }
    if (['pantalones', 'jeans', 'shorts', 'bermudas', 'joggers', 'sudaderas de pantalon'].includes(category)) {
      const length = category === 'shorts' || (has('short') && !has('bermuda')) ? 'short'
        : category === 'bermudas' || has('bermuda') ? 'knee' : 'full';
      const fit = has('jogger', 'sudadera') ? 'jogger' : has('flare', 'campana', 'bota ancha') ? 'flare'
        : has('baggy', 'cargo', 'wide', 'ancho', 'palazzo', 'carpenter', 'oversize') ? 'wide'
        : has('skinny', 'slim', 'legging') ? 'skinny' : 'straight';
      return { kind: 'pants', length, fit, denim: category === 'jeans' || has('jean', 'denim') };
    }
    return null;
  }

  function spec(product) {
    if (!product) return null;
    const category = normalize(product.category);
    const name = normalize(product.name);
    const has = (...words) => words.some(word => name.includes(word));
    if (category.includes('accesorio') || category.includes('gorra') || category.includes('zapato') || category.includes('tenis')) return null;

    if (['conjuntos', 'conjunto', 'sets', 'set'].includes(category)) {
      const top = has('hoodie', 'buzo', 'sudadera') ? { kind: 'hoodie', sleeve: 'long' }
        : has('crop', ' top') ? { kind: 'tee', sleeve: 'none', crop: true, fitted: true }
        : { kind: 'tee', sleeve: 'short', oversize: has('oversize', 'boxy') };
      const bottom = has('falda') ? { kind: 'skirt', length: 'mini', flare: 0.3 }
        : has('bermuda') ? { kind: 'pants', length: 'knee', fit: 'wide' }
        : has('short') ? { kind: 'pants', length: 'short', fit: 'straight' }
        : { kind: 'pants', length: 'full', fit: has('jogger', 'sudadera') ? 'jogger' : 'straight' };
      return { slot: 'set', top, bottom };
    }
    if (['vestidos', 'vestido'].includes(category)) {
      const length = has('mini') ? 'mini' : has('midi') ? 'midi' : has('largo', 'maxi', 'long') ? 'maxi' : 'knee';
      const sleeve = has('manga larga') ? 'long' : has('manga corta', 'manga') ? 'short' : has('strapless', 'straples', 'tubo') ? 'strapless' : 'straps';
      return { slot: 'onePiece', kind: 'dress', length, sleeve, fitted: has('ajustad', 'bodycon', 'tubo', 'slip', 'body') };
    }
    if (['bodies', 'body', 'bodysuit', 'bodydress'].includes(category)) {
      return { slot: 'onePiece', kind: 'body', sleeve: has('manga larga') ? 'long' : has('manga corta', 'manga') ? 'short' : 'straps' };
    }
    if (['traje de bano entero', 'trajes de bano enteros', 'one piece', 'vestidos de bano'].includes(category)) {
      return { slot: 'onePiece', kind: 'swimsuit', sleeve: 'straps' };
    }
    if (['enterizos', 'jumpsuits', 'overoles'].includes(category)) {
      return { slot: 'set', top: { kind: 'tee', sleeve: has('manga larga') ? 'long' : has('manga') ? 'short' : 'none', fitted: true }, bottom: { kind: 'pants', length: has('short') ? 'short' : 'full', fit: 'wide' } };
    }
    const top = topSpec(category, has);
    if (top) return { slot: 'top', ...top };
    const bottom = bottomSpec(category, has);
    if (bottom) return { slot: 'bottom', ...bottom };
    return null;
  }

  // Which slots a garment occupies: a dress or a set replaces both upper and lower garments.
  function slotsOf(product) {
    const result = spec(product);
    if (!result) return [];
    if (result.slot === 'top') return ['top'];
    if (result.slot === 'bottom') return ['bottom'];
    return ['top', 'bottom'];
  }

  window.NOVUM_PRENDAS = { normalize, spec, slotsOf, wearable: product => Boolean(spec(product)) };
})();
