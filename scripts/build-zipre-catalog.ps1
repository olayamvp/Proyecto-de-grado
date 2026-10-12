$ErrorActionPreference = 'Stop'
$STORE_URL = 'https://zipre.co'

function Get-ContentWithRetry($url) {
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      return (Invoke-WebRequest -Uri $url -TimeoutSec 45 -UseBasicParsing -Headers @{ 'User-Agent' = 'Mozilla/5.0'; Accept = 'text/html, application/xml' }).Content
    } catch {
      if ($attempt -eq 3) { throw }
      Start-Sleep -Seconds 2
    }
  }
}

function Normalize($value) {
  $text = ([string]$value).Normalize([Text.NormalizationForm]::FormD)
  $text = [regex]::Replace($text, '\p{Mn}', '')
  return [regex]::Replace($text.ToLowerInvariant(), '[^a-z0-9]+', ' ').Trim()
}

function Clean($value) {
  $text = [regex]::Replace([string]$value, '<[^>]*>', ' ')
  $text = [System.Net.WebUtility]::HtmlDecode($text)
  $text = [regex]::Replace($text, '\s+', ' ').Trim()
  return $text.Substring(0, [Math]::Min(320, $text.Length))
}

function Get-Category($name, $url, $description) {
  $text = Normalize "$name $url $description"
  if ($text -match 'panoleta|panol|bandana|bucket hat|sombrero') { return 'Accesorios' }
  if ($text -match 'pantalon|jogger|cargo pants|jean|short|bermuda|legging') { return 'Pantalones' }
  if ($text -match 'hoodie|buzo|sweater|saco') { return 'Buzos' }
  if ($text -match 'chaqueta|jacket|abrigo') { return 'Chaquetas' }
  if ($text -match 'crop top|camiseta|camisilla|tee|camisa|blusa|top') { return 'Camisetas' }
  return 'Accesorios'
}

function Get-Audience($name, $url, $description) {
  $text = Normalize "$name $url $description"
  if ($text -match '(^| )(mujer|women|woman|dama|femenina|femenino)( |$)') { return 'mujer' }
  if ($text -match '(^| )(hombre|men|masculino)( |$)') { return 'hombre' }
  return 'unisex'
}

function Get-Color($name) {
  $text = Normalize $name
  $colors = @(
    @{ token = 'azul marino'; value = 'Azul marino' },
    @{ token = 'azul claro'; value = 'Azul claro' },
    @{ token = 'azul medio'; value = 'Azul medio' },
    @{ token = 'verde'; value = 'Verde' },
    @{ token = 'negro'; value = 'Negro' },
    @{ token = 'blanco'; value = 'Blanco' },
    @{ token = 'beige'; value = 'Beige' },
    @{ token = 'cafe'; value = 'Café' },
    @{ token = 'morado'; value = 'Morado' },
    @{ token = 'rojo'; value = 'Rojo' },
    @{ token = 'amarillo'; value = 'Amarillo' },
    @{ token = 'rosa'; value = 'Rosa' },
    @{ token = 'gris'; value = 'Gris' },
    @{ token = 'arena'; value = 'Arena' },
    @{ token = 'tierra'; value = 'Tierra' }
  )
  foreach ($color in $colors) {
    if ($text -match "(^| )$([regex]::Escape($color.token))( |$)") { return $color.value }
  }
  return 'Varios'
}

function Convert-Product($url) {
  $html = Get-ContentWithRetry $url
  $schemaMatch = [regex]::Match($html, '(?is)<script[^>]*class=["'']rank-math-schema["''][^>]*>(.*?)</script>')
  if (-not $schemaMatch.Success) { throw "No se encontró la ficha estructurada del producto: $url" }
  $schema = $schemaMatch.Groups[1].Value | ConvertFrom-Json
  $product = $schema.'@graph' | Where-Object { $_.'@type' -eq 'Product' -or $_.'@type' -contains 'Product' } | Select-Object -First 1
  if (-not $product) { throw "La ficha no contiene un producto: $url" }

  $name = Clean ($product.name -replace '\s*\|\s*ZIPRE.*$', '')
  $description = Clean $product.description
  $category = Get-Category $name $url $product.category
  $offer = if ($product.offers -is [array]) { $product.offers | Select-Object -First 1 } else { $product.offers }
  $price = if ($offer.price) { [double]$offer.price } else { 0 }

  $images = @($product.image | ForEach-Object {
    if ($_ -is [string]) { $_ } elseif ($_.url) { $_.url } elseif ($_.contentUrl) { $_.contentUrl }
  } | Where-Object { $_ })
  if (-not $images.Count) { throw "No se encontró una imagen para $url" }

  $sizes = @()
  $variationMatch = [regex]::Match($html, '(?is)data-product_variations=["''](.*?)["'']')
  if ($variationMatch.Success) {
    $variationJson = [System.Net.WebUtility]::HtmlDecode($variationMatch.Groups[1].Value)
    $variations = $variationJson | ConvertFrom-Json
    $sizes = @($variations |
      Where-Object { $_.is_in_stock -or $_.backorders_allowed } |
      ForEach-Object { $_.attributes.PSObject.Properties | Where-Object { $_.Name -match 'talla|size' } | ForEach-Object { $_.Value } } |
      Where-Object { $_ } | Select-Object -Unique)
    $variationPrices = @($variations | Where-Object { $_.is_in_stock -or $_.backorders_allowed } | ForEach-Object { [double]$_.display_price } | Where-Object { $_ -gt 0 })
    if ($variationPrices.Count) { $price = ($variationPrices | Measure-Object -Minimum).Minimum }
  }
  if ($price -le 0) { throw "No se encontró un precio válido para $url" }

  $styles = if ($category -eq 'Accesorios') { @('Casual', 'Streetwear') } elseif ($category -in @('Chaquetas', 'Pantalones')) { @('Streetwear', 'Casual') } else { @('Streetwear', 'Casual', 'Minimalista') }
  return [pscustomobject]@{
    id = "zipre-$([regex]::Match($url, '/([^/]+)/?$').Groups[1].Value)"
    name = $name
    brand = 'ZIPRE'
    audience = Get-Audience $name $url $description
    category = $category
    styles = $styles
    price = [Math]::Round($price)
    color = Get-Color $name
    sizes = $sizes
    image = $images[0]
    logo = ''
    officialUrl = $url
    description = $description
    source = 'oficial'
  }
}

$sitemap = Get-ContentWithRetry "$STORE_URL/product-sitemap.xml"
$productUrls = @([regex]::Matches($sitemap, '<loc>([^<]+)</loc>') |
  ForEach-Object { [System.Net.WebUtility]::HtmlDecode($_.Groups[1].Value) } |
  Where-Object { $_ -ne "$STORE_URL/tienda/" })
if ($productUrls.Count -ne 28) { throw "El sitemap de ZIPRE contiene $($productUrls.Count) productos; se esperaban 28 (21 prendas y 7 accesorios)." }

$products = @()
foreach ($url in $productUrls) {
  $product = Convert-Product $url
  $products += $product
  Write-Output "$($product.category): $($product.name)"
}
if ($products.Count -ne 28 -or @($products.id | Select-Object -Unique).Count -ne 28) {
  throw "El catálogo ZIPRE no contiene exactamente 28 productos únicos."
}

$json = ConvertTo-Json -InputObject @($products) -Depth 10 -Compress
$file = Join-Path $PSScriptRoot '..\Contenido\js\zipre-products.js'
[IO.File]::WriteAllText($file, "window.ZIPRE_PRODUCTS = $json;`n", [Text.UTF8Encoding]::new($false))
Write-Output "Catálogo ZIPRE guardado con $($products.Count) productos."
