$ErrorActionPreference = 'Stop'

function Get-Products($page) {
  $url = "https://weedgreen.com/collections/all/products.json?limit=250&page=$page"
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $url -TimeoutSec 45 -UseBasicParsing -Headers @{ Accept = 'application/json' }
      return ($response.Content | ConvertFrom-Json).products
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
  return ([regex]::Replace($text, '\s+', ' ').Trim()).Substring(0, [Math]::Min(320, ([regex]::Replace($text, '\s+', ' ').Trim()).Length))
}

function Get-Category($product) {
  $text = Normalize ((@($product.title, $product.product_type) + @($product.tags)) -join ' ')
  if ($text -match 'bandeja|grinder|lighter|lightyer|rolling paper|filtros? wg|porta joint|cenicero|gorro|gorra|bucket|bandana|joyas?|panoleta|riñonera|accesor|medias|calcetin|sticker|bolso|utility belt|bong|mechero') { return $null }
  if ($text -match '(^| )(pantalon|jogger|sweatpant|cargo|jean|jort|short|bermuda|legging|falda|skirt)( |$)') { return 'Pantalones' }
  if ($text -match '(^| )(buso|camibuso|saco|hoodie|sweatshirt|crewneck|sweater|chaqueta|jacket|cardigan)( |$)') { return 'Buzos' }
  if ($text -match '(^| )(camiseta|camisilla|tee|top|shirt|crop|body|camisa|tank|polo|long sleeve|loongsleeve|blusa|bralette)( |$)') { return 'Camisetas' }
  return $null
}

function Get-Audience($product) {
  $text = Normalize ((@($product.title, $product.product_type) + @($product.tags)) -join ' ')
  if ($text -match '(^| )(mujer|women|woman|dama|femenina|femenino)( |$)') { return 'mujer' }
  if ($text -match '(^| )(hombre|men|masculino)( |$)') { return 'hombre' }
  return 'unisex'
}

function Get-Color($title) {
  $text = Normalize $title
  $colors = @(
    @{ token = 'azul marino'; value = 'Azul marino' },
    @{ token = 'azul claro'; value = 'Azul claro' },
    @{ token = 'azul medio'; value = 'Azul medio' },
    @{ token = 'verde'; value = 'Verde' },
    @{ token = 'negro'; value = 'Negro' },
    @{ token = 'black'; value = 'Negro' },
    @{ token = 'blanco'; value = 'Blanco' },
    @{ token = 'white'; value = 'Blanco' },
    @{ token = 'azul'; value = 'Azul' },
    @{ token = 'blue'; value = 'Azul' },
    @{ token = 'cafe'; value = 'Café' },
    @{ token = 'chocolate'; value = 'Café' },
    @{ token = 'beige'; value = 'Beige' },
    @{ token = 'arena'; value = 'Beige' },
    @{ token = 'gris'; value = 'Gris' },
    @{ token = 'rosado'; value = 'Rosado' },
    @{ token = 'rosa'; value = 'Rosado' },
    @{ token = 'rojo'; value = 'Rojo' },
    @{ token = 'nude'; value = 'Nude' },
    @{ token = 'lila'; value = 'Lila' }
  )
  foreach ($color in $colors) {
    if ($text -match "(^| )$([regex]::Escape($color.token))( |$)") { return $color.value }
  }
  return 'Varios'
}

function Convert-Product($product, $category) {
  $available = @($product.variants | Where-Object { $_.available })
  if (-not $available.Count) { return $null }
  $images = @($product.images | Where-Object { $_.src -and $_.src -notmatch '(?i)(size.?chart|guia.?de.?tallas)' })
  if (-not $images.Count) { return $null }
  $prices = @($available | ForEach-Object { [double]$_.price } | Where-Object { $_ -gt 0 })
  if (-not $prices.Count) { return $null }
  $styles = if ($category -eq 'Buzos') { @('Streetwear', 'Casual', 'Vintage') } elseif ($category -eq 'Pantalones') { @('Streetwear', 'Casual') } else { @('Streetwear', 'Casual', 'Y2K') }
  return [pscustomobject]@{
    id = "weedgreen-$($product.id)"
    name = Clean $product.title
    brand = 'Weedgreen'
    audience = Get-Audience $product
    category = $category
    styles = $styles
    price = ($prices | Measure-Object -Minimum).Minimum
    color = Get-Color $product.title
    sizes = @($available | ForEach-Object { $_.title } | Where-Object { $_ -and $_ -notmatch '(?i)^default title$' } | Select-Object -Unique)
    image = $images[0].src
    logo = ''
    officialUrl = "https://weedgreen.com/products/$($product.handle)"
    description = (Clean $product.body_html)
    source = 'oficial'
  }
}

$rawProducts = @(Get-Products 1)
$categories = @(
  @{ name = 'Camisetas'; limit = 12 },
  @{ name = 'Pantalones'; limit = 12 },
  @{ name = 'Buzos'; limit = 11 }
)
$selectedProducts = @()
foreach ($category in $categories) {
  $items = @($rawProducts |
    Where-Object { (Get-Category $_) -eq $category.name } |
    Sort-Object -Property published_at -Descending |
    ForEach-Object { Convert-Product $_ $category.name } |
    Where-Object { $_ } |
    Group-Object -Property name |
    ForEach-Object { $_.Group[0] } |
    Select-Object -First $category.limit)
  if ($items.Count -lt $category.limit) {
    throw "Weedgreen solo tiene $($items.Count) prendas válidas en la categoría $($category.name); se necesitan $($category.limit)."
  }
  $selectedProducts += $items
  Write-Output "Weedgreen $($category.name): $($items.Count) prendas"
}

if ($selectedProducts.Count -ne 35) { throw "Se esperaban 35 prendas; se encontraron $($selectedProducts.Count)." }
$json = ConvertTo-Json -InputObject @($selectedProducts) -Depth 10 -Compress
$file = Join-Path $PSScriptRoot '..\Contenido\js\weedgreen-products.js'
[IO.File]::WriteAllText($file, "window.WEEDGREEN_PRODUCTS = $json;`n", [Text.UTF8Encoding]::new($false))
Write-Output "Catálogo Weedgreen guardado con $($selectedProducts.Count) prendas."
