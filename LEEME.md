<!--multilang v0 es:LEEME.md en:README.md -->
# tab-plus

<!--lang:es-->
Parser y generador para el formato de archivo `.tab` usado por [backend-plus](https://github.com/codenautas/backend-plus)
para poblar tablas de base de datos con datos iniciales.
<!--lang:en--]
Parser and generator for the `.tab` file format used by [backend-plus](https://github.com/codenautas/backend-plus)
to seed database tables with initial data.
[!--lang:*-->

<!--multilang buttons-->

idioma: ![castellano](https://raw.githubusercontent.com/codenautas/multilang/master/img/lang-es.png)
también disponible en:
[![inglés](https://raw.githubusercontent.com/codenautas/multilang/master/img/lang-en.png)](README.md)

<!--lang:es-->
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
<!--lang:en--]
## The `.tab` format

* Records are separated by lines (`\r\n` or `\n`).
* Fields within a record are separated by `|`.
* The first record is the header (field names); the rest are data rows.
* `\` is the escape character. It can produce:
  * `\t`, `\r`, `\n`, `\s` for tab, carriage return, line feed and space.
  * `\xHH` for any byte, given as a 1 or 2 digit hex code (e.g. `\x7C` is `|`).
  * `\` followed by any other character yields that character literally (so `\\` is `\` and `\|` is `|`).
* Lines made up only of `-`, `|` and spaces (e.g. a markdown-style `---|---` divider) and blank lines are ignored,
  so `.tab` files can be written to look like a readable table.
* Trailing whitespace on a field is trimmed. This trimming happens on the raw (still escaped) text before
  escape sequences are resolved, so it only removes literal trailing spaces/tabs — a trailing `\s` (or any
  other escape sequence) is not affected and is kept in the resulting value.
* A leading UTF-8 BOM on the first header field is stripped.
* A field with no content at all, i.e. two adjacent separators (`a||b`) or a field alone on its line, is by
  default an empty string. This can be changed with the `emptyField` option (see below).
* `\E` and `\N` are whole-field markers for an explicit empty string and an explicit `null`. They always mean
  that, regardless of the `emptyField` option.

The **generator** in this library always produces output that is safe to split "raw": splitting the generated
text by line breaks always separates records, and splitting a line by `|` always separates fields. This means it
never emits an escaped `|` (`\|`) — a literal `|` in a value is always generated as `\x7C` instead — and every
`\r`, `\n`, `\\` and tab is always escaped.

### The `emptyField` option

`parseTab`, `generateTab`, `parseRow`, `generateRow`, `unescapeField` and `escapeField` all accept an optional
`options` argument with an `emptyField` property: `'string'` (the default), `'null'`, or a `symbol`.

* `'string'` (default): a field with no content at all parses as `''`; a `null` value is generated explicitly
  as `\N` (since implicit-empty already means `''`).
* `'null'`: a field with no content at all parses as `null`; an empty string value (`''`) is generated
  explicitly as `\E` (since implicit-empty now means `null`).
* a `symbol`: a field with no content at all parses as that exact symbol; both `''` and `null` are generated
  explicitly (as `\E` and `\N`). This is useful when the meaning of "nothing was written here" needs to be told
  apart from an explicit `''` or `null` — for example, when loading a `.tab` file into a table and you want a
  field left blank to mean "use whatever the column's definition says" (its schema default, or leave it
  untouched), while `\E` and `\N` still let you force an empty string or `NULL` regardless of that definition.
  Generating a field for any other symbol throws.

In every mode `\E` always parses as `''` and `\N` always parses as `null`, and `generateTab`/`generateRow` never
need to emit them for the "default" value of the chosen mode — only for the non-default ones — so a round trip
through `generateTab`/`parseTab` (or `generateRow`/`parseRow`) with the same options always preserves `''`,
`null` and the configured symbol as distinct values.
[!--lang:*-->

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

<!--lang:es-->
## Instalación
<!--lang:en--]
## Install
[!--lang:*-->

```
npm install tab-plus
```

<!--lang:es-->
La librería está escrita en TypeScript e incluye sus propias declaraciones de tipos (`dist/tab-plus.d.ts`); no
hace falta ningún paquete `@types`.
<!--lang:en--]
The library is written in TypeScript and ships its own type declarations (`dist/tab-plus.d.ts`); no `@types`
package is needed.
[!--lang:*-->

## API

```js
var tabPlus = require('tab-plus');
```

```ts
import * as tabPlus from 'tab-plus';
```

### `tabPlus.parseTab(text, options)`

<!--lang:es-->
Parsea el contenido completo de un archivo `.tab`. Devuelve `{fields, rows}` donde `fields` es un array con los
nombres de columna y `rows` es un array de arrays de valores de campo (strings, además de `null` donde
corresponda — ver `emptyField` más arriba). `options` es opcional; ver la opción `emptyField` más arriba.
<!--lang:en--]
Parses the full content of a `.tab` file. Returns `{fields, rows}` where `fields` is an array of column names and
`rows` is an array of arrays of field values (strings, plus `null` where applicable — see `emptyField` above).
`options` is optional; see the `emptyField` option above.
[!--lang:*-->

```js
tabPlus.parseTab('a|b\r\n1|2\r\n');
// => {fields: ['a', 'b'], rows: [['1', '2']]}
```

### `tabPlus.generateTab(tab, options)`

<!--lang:es-->
Genera el contenido completo de un archivo `.tab` a partir de `{fields, rows}` (la inversa de `parseTab`).
`options` es opcional; ver la opción `emptyField` más arriba.
<!--lang:en--]
Generates the full content of a `.tab` file from `{fields, rows}` (the inverse of `parseTab`). `options` is
optional; see the `emptyField` option above.
[!--lang:*-->

```js
tabPlus.generateTab({fields: ['a', 'b'], rows: [['1', '2']]});
// => 'a|b\r\n1|2\r\n'
```

### `tabPlus.parseRow(rawRow, options)`

<!--lang:es-->
Parsea una única línea cruda (sin su salto de línea) a un array de valores de campo.
<!--lang:en--]
Parses a single raw line (without its line break) into an array of field values.
[!--lang:*-->

### `tabPlus.generateRow(row, options)`

<!--lang:es-->
Genera una única línea cruda (sin salto de línea) a partir de un array de valores de campo.
<!--lang:en--]
Generates a single raw line (without a line break) from an array of field values.
[!--lang:*-->

### `tabPlus.escapeField(value, options)` / `tabPlus.unescapeField(rawValue, options)`

<!--lang:es-->
Escapa/desescapa el valor de un único campo. `escapeField` trata `undefined` exactamente igual que `null` — no
hay un comportamiento separado para una entrada faltante del array vs. un `null` explícito.
<!--lang:en--]
Escape/unescape a single field's value. `escapeField` treats `undefined` exactly like `null` — there's no
separate behavior for a missing array entry vs. an explicit `null`.
[!--lang:*-->

<!--lang:es-->
### Tipos

El paquete exporta los tipos de TypeScript `FieldValue` (`string | null | symbol`), `Options` (`{emptyField?:
'string' | 'null' | symbol}`) y `Tab` (`{fields: FieldValue[], rows: FieldValue[][]}`).
<!--lang:en--]
### Types

The package exports the TypeScript types `FieldValue` (`string | null | symbol`), `Options` (`{emptyField?:
'string' | 'null' | symbol}`) and `Tab` (`{fields: FieldValue[], rows: FieldValue[][]}`).
[!--lang:*-->

<!--lang:es-->
## Licencia
<!--lang:en--]
## License
[!--lang:*-->

MIT
