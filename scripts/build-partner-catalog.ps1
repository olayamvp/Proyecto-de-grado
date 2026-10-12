$ErrorActionPreference = 'Stop'

function Get-Json($url) {
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $url -TimeoutSec 35 -UseBasicParsing -Headers @{ Accept = 'application/json' }
      return $response.Content | ConvertFrom-Json
    } catch {
      if ($attempt -eq 3) { throw }
      Start-Sleep -Seconds 2
    }
  }
}

function Normalize($value) {
  $text = ([string]$value).Normalize([Text.NormalizationForm]::FormD)
  $text = [regex]::Replace($text, '\p{Mn}', '')
  return $text.ToLowerInvariant()
}

function Clean($value) {
  $text = [regex]::Replace([string]$value, '<[^>]*>', ' ')
  $text = [System.Net.WebUtility]::HtmlDecode($text)
  return (($text -replace '\s+', ' ').Trim()).Substring(0, [Math]::Min(320, (($text -replace '\s+', ' ').Trim()).Length))
}

function Get-Category($name, $type, $extra) {
  $text = Normalize ((@($name, $type) + @($extra)) -join ' ')
  if ($text -match 'accesor|bolso|bandolera|choker|sombrero|gorro|media|calcetin|correa|abanico|portabotella|zapato|flor crochet') { return $null }
  if ($text -match 'vestido|dress') { return 'Vestidos' }
  if ($text -match 'falda') { return 'Faldas' }
  if ($text -match 'pantalon|jean|jogger|legging|short|bermuda') { return 'Pantalones' }
  if ($text -match 'conjunto|set ') { return 'Conjuntos' }
  if ($text -match 'chaqueta|abrigo|cardigan|chaleco|blazer|kimono|ruana|poncho|capa') { return 'Chaquetas' }
  if ($text -match 'buzo|hoodie|sweater|sueter|crewneck|sudadera|tejido|punto') { return 'Buzos' }
  if ($text -match 'body') { return 'Bodies' }
  if ($text -match 'top|blusa|bluson|camisa|camiseta|tee|polo|camisola') { return 'Camisetas' }
  return $null
}

function Get-Audience($name, $type, $extra, $fallback = 'unisex') {
  $text = Normalize ((@($name, $type) + @($extra)) -join ' ')
  if ($text -match '\bhombre\b|\bmen\b|masculin') { return 'hombre' }
  if ($text -match '\bmujer\b|\bwomen\b|femenin|dama') { return 'mujer' }
  return $fallback
}

function Get-Styles($category, $audience) {
  if ($category -in @('Vestidos', 'Faldas', 'Tops')) { return @('Casual', 'Y2K') }
  if ($audience -eq 'unisex') { return @('Streetwear', 'Casual') }
  return @('Casual', 'Minimalista')
}

function Convert-Shopify($product, $brand, $baseUrl, $fallback) {
  $extra = @($product.tags) + @($product.product_type)
  $category = Get-Category $product.title $product.product_type $product.tags
  if (-not $category -or -not $product.images.Count) { return $null }
  $variants = @($product.variants)
  $available = @($variants | Where-Object { $_.available })
  $selected = if ($available.Count) { $available } else { $variants }
  $prices = @($selected | ForEach-Object { [double]$_.price })
  if (-not $prices.Count) { return $null }
  $minimumPrice = ($prices | Measure-Object -Minimum).Minimum
  $audience = Get-Audience $product.title $product.product_type $extra $fallback
  $brandId = (Normalize $brand) -replace '[^a-z0-9]+', '-'
  $options = @($product.options)
  $colorOption = $options | Where-Object { $_.name -match 'color' } | Select-Object -First 1
  $sizes = @($selected | ForEach-Object { $_.title } | Where-Object { $_ -and $_ -notmatch '^default title$' } | Select-Object -Unique)
  return [pscustomobject]@{
    id = "$brandId-$($product.id)"; name = Clean $product.title; brand = $brand
    audience = $audience; category = $category; styles = @(Get-Styles $category $audience); price = [double]$minimumPrice
    color = if ($colorOption -and $colorOption.values.Count) { $colorOption.values[0] } else { 'Varios' }
    sizes = $sizes; image = $product.images[0].src; logo = ''; officialUrl = "$baseUrl/products/$($product.handle)"
    description = "$(Clean $product.title). Consulta precio, tallas y disponibilidad en la tienda oficial."; source = 'oficial'
  }
}

function Convert-Woo($product, $brand, $rate, $fallback) {
  $categories = @($product.categories | ForEach-Object { $_.name })
  $category = Get-Category $product.name '' $categories
  if (-not $category -or -not $product.images.Count) { return $null }
  $currency = $product.prices.currency_code
  $divisor = [Math]::Pow(10, [int]$product.prices.currency_minor_unit)
  $originalPrice = [double]$product.prices.price / $divisor
  $price = if ($currency -eq 'COP') { $originalPrice } elseif ($currency -eq 'EUR' -and $rate) { $originalPrice * $rate } else { 0 }
  if ($price -le 0) { return $null }
  $extra = @($product.attributes | ForEach-Object { $_.name; $_.terms | ForEach-Object { $_.name } }) + $categories
  $audience = Get-Audience $product.name '' $extra $fallback
  $sizes = @($product.attributes | Where-Object { $_.name -match 'talla|size' } | ForEach-Object { $_.terms | ForEach-Object { $_.name } } | Select-Object -Unique)
  $descriptionSource = if ($product.description) { $product.description } else { $product.short_description }
  $description = Clean $descriptionSource
  if (-not $description) { $description = "$(Clean $product.name). Consulta tallas y disponibilidad en la tienda oficial." }
  if ($currency -eq 'EUR') { $description += ' Precio aproximado convertido desde EUR a COP; confirma el valor final en la tienda oficial.' }
  $brandId = (Normalize $brand) -replace '[^a-z0-9]+', '-'
  $color = $product.attributes | Where-Object { $_.name -match 'color' } | Select-Object -First 1
  $item = [ordered]@{
    id = "$brandId-$($product.id)"; name = Clean $product.name; brand = $brand
    audience = $audience; category = $category; styles = @(Get-Styles $category $audience); price = [Math]::Round($price)
    color = if ($color -and $color.terms.Count) { $color.terms[0].name } else { 'Varios' }; sizes = $sizes; image = $product.images[0].src; logo = ''; officialUrl = $product.permalink
    description = $description; source = 'oficial'
  }
  if ($currency -eq 'EUR') { $item.priceCurrencyOriginal = 'EUR' }
  return [pscustomobject]$item
}

$rate = [double](Get-Json 'https://api.frankfurter.dev/v2/rate/EUR/COP').rate
$shops = @(
  @{ brand = 'Agybo'; url = 'https://agybo.com'; platform = 'shopify'; audience = 'unisex' },
  @{ brand = 'Zohet'; url = 'https://zohet.com.co'; platform = 'woo'; audience = 'mujer' },
  @{ brand = 'One Five'; url = 'https://www.onefive.com.co'; platform = 'shopify'; audience = 'mujer' }
)

$allProducts = @()
foreach ($shop in $shops) {
  if ($shop.platform -eq 'shopify') {
    $raw = Get-Json "$($shop.url)/products.json?limit=250"
    $items = @($raw.products | ForEach-Object { Convert-Shopify $_ $shop.brand $shop.url $shop.audience } | Where-Object { $_ } | Select-Object -First 30)
  } else {
    $raw = @()
    foreach ($page in 1..2) {
      $pageProducts = @(Get-Json "$($shop.url)/wp-json/wc/store/v1/products?per_page=100&page=$page")
      if (-not $pageProducts.Count) { break }
      $raw += $pageProducts
    }
    $items = @($raw | ForEach-Object { Convert-Woo $_ $shop.brand $rate $shop.audience } | Where-Object { $_ } | Select-Object -First 30)
  }
  if ($items.Count -lt 30) { Write-Warning "$($shop.brand): se encontraron $($items.Count) prendas válidas en la tienda; se cargarán todas." }
  $allProducts += $items
  Write-Output "$($shop.brand): $($items.Count) prendas"
}

$json = ConvertTo-Json -InputObject @($allProducts) -Depth 12 -Compress
$file = Join-Path $PSScriptRoot '..\Contenido\js\partner-products.js'
[IO.File]::WriteAllText($file, "window.PARTNER_PRODUCTS = $json;`n", [Text.UTF8Encoding]::new($false))
