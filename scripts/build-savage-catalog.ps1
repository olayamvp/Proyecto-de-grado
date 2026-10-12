$ErrorActionPreference = 'Stop'
$STORE_URL = 'https://www.savagecolombia.com'

function Get-Products {
  $url = "$STORE_URL/collections/all/products.json?limit=250&page=1"
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
  $text = [regex]::Replace($text, '\s+', ' ').Trim()
  return $text.Substring(0, [Math]::Min(320, $text.Length))
}

function Get-Category($product) {
  $text = Normalize ((@($product.title, $product.product_type) + @($product.tags)) -join ' ')
  if ($text -match 'accesor|gorra|gorro|bucket|bolso|media|calcetin|cadena|collar|anillo|pulsera|sticker|llavero|termo|mug|billetera|bandana|lentes|gafas|aretes|riñonera|beanie') { return $null }
  if ($text -match 'pantalon|jogger|sweatpant|cargo|jean|jort|short|bermuda|legging|falda|skirt') { return 'Pantalones' }
  if ($text -match 'hoodie|buzo|crewneck|sweatshirt|sweater|chaqueta|jacket|cardigan|camibuzo') { return 'Buzos' }
  if ($text -match 'camiseta|camisilla|tee|top|shirt|crop|body|camisa|tank|polo|blusa|jersey|blank') { return 'Camisetas' }
  return $null
}

function Get-Audience($product) {
  $text = Normalize ((@($product.title, $product.body_html, $product.product_type) + @($product.tags)) -join ' ')
  if ($text -match '(^| )(mujer|women|woman|dama|femenina|femenino)( |$)') { return 'mujer' }
  if ($text -match '(^| )(hombre|men|masculino)( |$)') { return 'hombre' }
  return 'unisex'
}

function Get-Color($title) {
  $text = Normalize $title
  $colors = @(
    @{ token = 'azul marino'; value = 'Azul marino' },
    @{ token = 'azul medio'; value = 'Azul medio' },
    @{ token = 'azul claro'; value = 'Azul claro' },
    @{ token = 'verde militar'; value = 'Verde militar' },
    @{ token = 'gris oscuro'; value = 'Gris oscuro' },
    @{ token = 'gris claro'; value = 'Gris claro' },
    @{ token = 'verde'; value = 'Verde' },
    @{ token = 'negro'; value = 'Negro' },
    @{ token = 'black'; value = 'Negro' },
    @{ token = 'blanca'; value = 'Blanco' },
    @{ token = 'blanco'; value = 'Blanco' },
    @{ token = 'white'; value = 'Blanco' },
    @{ token = 'azul'; value = 'Azul' },
    @{ token = 'blue'; value = 'Azul' },
    @{ token = 'cafe'; value = 'Café' },
    @{ token = 'chocolate'; value = 'Café' },
    @{ token = 'beige'; value = 'Beige' },
    @{ token = 'arena'; value = 'Beige' },
    @{ token = 'camel'; value = 'Camel' },
    @{ token = 'ivory'; value = 'Marfil' },
    @{ token = 'marfil'; value = 'Marfil' },
    @{ token = 'gris'; value = 'Gris' },
    @{ token = 'rojo'; value = 'Rojo' },
    @{ token = 'rosa'; value = 'Rosa' },
    @{ token = 'rosado'; value = 'Rosa' },
    @{ token = 'lila'; value = 'Lila' },
    @{ token = 'crema'; value = 'Crema' },
    @{ token = 'cemento'; value = 'Gris' },
    @{ token = 'kaky'; value = 'Caqui' },
    @{ token = 'caqui'; value = 'Caqui' }
  )
  foreach ($color in $colors) {
    if ($text -match "(^| )$([regex]::Escape($color.token))( |$)") { return $color.value }
  }
  return 'Varios'
}

function Convert-Product($product, $category) {
  $variants = @($product.variants | Where-Object { $_.available })
  $images = @($product.images | Where-Object { $_.src -and $_.src -notmatch '(?i)(size.?chart|guia.?de.?tallas)' })
  if (-not $variants.Count -or -not $images.Count) { return $null }
  $prices = @($variants | ForEach-Object { [double]$_.price } | Where-Object { $_ -gt 0 })
  if (-not $prices.Count) { return $null }
  $styles = if ($category -eq 'Buzos') { @('Streetwear', 'Casual', 'Techwear') } elseif ($category -eq 'Pantalones') { @('Streetwear', 'Casual') } else { @('Streetwear', 'Casual', 'Vintage') }
  $description = Clean $product.body_html
  if (-not $description) { $description = "$(Clean $product.title). Confirma precio, tallas y disponibilidad en la tienda oficial." }
  return [pscustomobject]@{
    id = "savage-$($product.id)"
    name = Clean $product.title
    brand = 'Savage'
    audience = Get-Audience $product
    category = $category
    styles = $styles
    price = ($prices | Measure-Object -Minimum).Minimum
    color = Get-Color $product.title
    sizes = @($variants | ForEach-Object { $_.title } | Where-Object { $_ -and $_ -notmatch '(?i)^default title$' } | Select-Object -Unique)
    image = $images[0].src
    logo = ''
    officialUrl = "$STORE_URL/products/$($product.handle)"
    description = $description
    source = 'oficial'
  }
}

$rawProducts = @(Get-Products)
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
    Select-Object -First $category.limit)
  if ($items.Count -lt $category.limit) {
    throw "Savage solo tiene $($items.Count) prendas disponibles en la categoría $($category.name); se necesitan $($category.limit)."
  }
  $selectedProducts += $items
  Write-Output "Savage $($category.name): $($items.Count) prendas"
}

if ($selectedProducts.Count -ne 35) { throw "Se esperaban 35 prendas; se encontraron $($selectedProducts.Count)." }
$json = ConvertTo-Json -InputObject @($selectedProducts) -Depth 10 -Compress
$file = Join-Path $PSScriptRoot '..\Contenido\js\savage-products.js'
[IO.File]::WriteAllText($file, "window.SAVAGE_PRODUCTS = $json;`n", [Text.UTF8Encoding]::new($false))
Write-Output "Catálogo Savage guardado con $($selectedProducts.Count) prendas."
