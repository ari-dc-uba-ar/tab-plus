# tab-plus

*Read this in other languages: [English](README.md)*

Parser y generador para el formato de archivo `.tab` usado por [backend-plus](https://github.com/codenautas/backend-plus)
para poblar tablas de base de datos con datos iniciales.

## El formato `.tab`

* Los registros se separan por líneas (`\r\n` o `\n`).
* Los campos dentro de un registro se separan con `|`.
* El primer registro es el encabezado (nombres de campo); el resto son filas de datos.
* `\` es el carácter de escape. Puede producir:
  * `\t`, `\r`, `\n`, `\s` para tabulación, retorno de carro, salto de línea y espacio.
  * `\xHH` para cualquier byte, dado como un código hexadecimal de 1 o 2 dígitos (por ejemplo, `\x7C` es `|`).
  * `\` seguido de cualquier otro carácter produce ese carácter literalmente (así `\\` es `\` y `\|` es `|`).
* Las líneas formadas solo por `-`, `|` y espacios (por ejemplo, un divisor estilo markdown `---|---`) y las
  líneas en blanco se ignoran, de modo que los archivos `.tab` se pueden escribir para que se vean como una
  tabla legible.
* Los espacios en blanco al final de un campo se recortan. Este recorte ocurre sobre el texto crudo (todavía
  escapado) antes de resolver las secuencias de escape, por lo que solo elimina espacios/tabs literales al
  final — un `\s` final (o cualquier otra secuencia de escape) no se ve afectado y se conserva en el valor
  resultante.
* Se elimina un BOM UTF-8 inicial en el primer campo del encabezado.
* Un campo sin contenido alguno, es decir dos separadores adyacentes (`a||b`) o un campo solo en su línea, es
  por defecto un string vacío. Esto se puede cambiar con la opción `emptyField` (ver más abajo).
* `\E` y `\N` son marcadores de campo completo para un string vacío explícito y un `null` explícito. Siempre
  significan eso, sin importar la opción `emptyField`.

El **generador** de esta librería siempre produce una salida segura para dividir "en crudo": dividir el texto
generado por saltos de línea siempre separa registros, y dividir una línea por `|` siempre separa campos. Esto
significa que nunca emite un `|` escapado (`\|`) — un `|` literal en un valor siempre se genera como `\x7C` en
su lugar — y todo `\r`, `\n`, `\\` y tabulación siempre se escapa.

### La opción `emptyField`

`parseTab`, `generateTab`, `parseRow`, `generateRow`, `unescapeField` y `escapeField` aceptan todas un
argumento `options` opcional con una propiedad `emptyField`: `'string'` (por defecto), `'null'`, o un `symbol`.

* `'string'` (por defecto): un campo sin contenido alguno se parsea como `''`; un valor `null` se genera
  explícitamente como `\N` (ya que el vacío implícito ya significa `''`).
* `'null'`: un campo sin contenido alguno se parsea como `null`; un valor de string vacío (`''`) se genera
  explícitamente como `\E` (ya que el vacío implícito ahora significa `null`).
* un `symbol`: un campo sin contenido alguno se parsea como ese symbol exacto; tanto `''` como `null` se
  generan explícitamente (como `\E` y `\N`). Esto es útil cuando el significado de "acá no se escribió nada"
  necesita distinguirse de un `''` o `null` explícitos — por ejemplo, al cargar un archivo `.tab` en una tabla
  y querer que un campo dejado en blanco signifique "usar lo que diga la definición de la columna" (su valor
  por defecto del esquema, o dejarlo sin tocar), mientras que `\E` y `\N` siguen permitiendo forzar un string
  vacío o `NULL` sin importar esa definición. Generar un campo para cualquier otro symbol lanza una excepción.

En todos los modos `\E` siempre se parsea como `''` y `\N` siempre se parsea como `null`, y `generateTab`/
`generateRow` nunca necesitan emitirlos para el valor "por defecto" del modo elegido — solo para los que no lo
son — así que un round trip a través de `generateTab`/`parseTab` (o `generateRow`/`parseRow`) con las mismas
opciones siempre preserva `''`, `null` y el symbol configurado como valores distintos.

```js
tabPlus.parseRow('a||b', {emptyField: 'null'});
// => ['a', null, 'b']
tabPlus.generateRow(['a', null, 'b'], {emptyField: 'null'});
// => 'a||b'
tabPlus.generateRow(['a', '', 'b'], {emptyField: 'null'});
// => 'a|\\E|b'

var missing = Symbol('missing');
tabPlus.parseRow('a||b', {emptyField: missing});
// => ['a', missing, 'b']
tabPlus.generateRow(['a', null, ''], {emptyField: missing});
// => 'a|\\N|\\E'
```

## Instalación

```
npm install tab-plus
```

La librería está escrita en TypeScript e incluye sus propias declaraciones de tipos (`dist/tab-plus.d.ts`); no
hace falta ningún paquete `@types`.

## API

```js
var tabPlus = require('tab-plus');
```

```ts
import * as tabPlus from 'tab-plus';
```

### `tabPlus.parseTab(text, options)`

Parsea el contenido completo de un archivo `.tab`. Devuelve `{fields, rows}` donde `fields` es un array con los
nombres de columna y `rows` es un array de arrays de valores de campo (strings, además de `null` donde
corresponda — ver `emptyField` más arriba). `options` es opcional; ver la opción `emptyField` más arriba.

```js
tabPlus.parseTab('a|b\r\n1|2\r\n');
// => {fields: ['a', 'b'], rows: [['1', '2']]}
```

### `tabPlus.generateTab(tab, options)`

Genera el contenido completo de un archivo `.tab` a partir de `{fields, rows}` (la inversa de `parseTab`).
`options` es opcional; ver la opción `emptyField` más arriba.

```js
tabPlus.generateTab({fields: ['a', 'b'], rows: [['1', '2']]});
// => 'a|b\r\n1|2\r\n'
```

### `tabPlus.parseRow(rawRow, options)`

Parsea una única línea cruda (sin su salto de línea) a un array de valores de campo.

### `tabPlus.generateRow(row, options)`

Genera una única línea cruda (sin salto de línea) a partir de un array de valores de campo.

### `tabPlus.escapeField(value, options)` / `tabPlus.unescapeField(rawValue, options)`

Escapa/desescapa el valor de un único campo. `escapeField` trata `undefined` exactamente igual que `null` — no
hay un comportamiento separado para una entrada faltante del array vs. un `null` explícito.

### Tipos

El paquete exporta los tipos de TypeScript `FieldValue` (`string | null | symbol`), `Options` (`{emptyField?:
'string' | 'null' | symbol}`) y `Tab` (`{fields: FieldValue[], rows: FieldValue[][]}`).

## Licencia

MIT
