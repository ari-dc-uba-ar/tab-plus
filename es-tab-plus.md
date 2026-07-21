<!--multilang v0 es:es-tab-plus.md en:tab-plus.md -->
<!--lang:es-->
# Columnas esparsas en `tab-plus`
<!--lang:en--]
# Sparse columns in `tab-plus`
[!--lang:*-->

<!--lang:es-->
## Caso de uso
<!--lang:en--]
## Use case
[!--lang:*-->

<!--lang:es-->
Un uso frecuente de `.tab` es tener tablas de valores iniciales como parte del código fuente (o del código de
ejemplo), con columnas que son switches booleanos o códigos que solo un puñado de filas tiene distinto del
valor más común.

Por ejemplo, para una tabla de países, agregar una columna `prefijo_telefonico` va a hacer diferir todas las
filas (cada país tiene su propio prefijo), y eso es razonable. Pero agregar una columna `estrellas` (cantidad
de copas del mundo de fútbol masculino ganadas) solo tiene un valor distinto de "0 / nunca ganó" en 8 filas de
más de 190. Escribir esa columna como una columna común obligaría a repetir el valor por defecto en todas las
demás filas, ensuciando el diff cada vez que se agregue una columna de este tipo.

Las **columnas esparsas** resuelven esto: solo aparecen, dentro de una única columna final del archivo, los
pares `columna:valor` de las filas que difieren del valor por defecto declarado en el encabezado.
<!--lang:en--]
A common use for `.tab` is keeping tables of initial values as part of the source code (or example code), with
columns that are boolean switches or codes where only a handful of rows differ from the most common value.

For example, for a table of countries, adding a `phone_prefix` column will make every row differ (each country
has its own prefix), and that's reasonable. But adding a `stars` column (number of men's football World Cups
won) only has a value other than "0 / never won" in 8 rows out of more than 190. Writing that column as a
regular column would force repeating the default value on every other row, cluttering the diff every time a
column like this is added.

**Sparse columns** solve this: only the `column:value` pairs for rows that differ from the default declared in
the header appear, within a single final column of the file.
[!--lang:*-->

<!--lang:es-->
## Sintaxis
<!--lang:en--]
## Syntax
[!--lang:*-->

<!--lang:es-->
En el encabezado, el nombre de la última columna empieza con `\:`. Después de `\:` van los nombres de las
columnas esparsas, separados por un espacio físico (usar `\s` para un espacio literal dentro de un nombre). Cada
nombre puede llevar el sufijo `:valor`, que declara el valor por defecto de esa columna; si no lleva sufijo, el
valor por defecto es `\N` (`null`).

En cada fila de datos, la última columna contiene los pares `columna:valor` (los dos puntos son siempre
obligatorios) de las columnas esparsas cuyo valor, en esa fila, difiere del valor por defecto declarado en el
encabezado. Los pares se separan también con un espacio físico (`\s` para un espacio literal dentro de un
valor). No hace falta listar ahí las columnas que en esa fila tienen el valor por defecto.

A nivel de `fields`/`rows` no hay ninguna diferencia entre una columna común y una esparsa: la tabla
subyacente es una tabla plana común y corriente (la misma que se usaría para poblar una base de datos, por
ejemplo), y `fields` incluye también los nombres de las columnas esparsas. Lo esparso es solo una forma de
*serializar* esa tabla en el archivo `.tab`, para economizar diff — ver `columnDefs` más abajo.
<!--lang:en--]
In the header, the name of the last column starts with `\:`. After `\:` come the names of the sparse columns,
separated by a physical space (use `\s` for a literal space inside a name). Each name may carry a `:value`
suffix, which declares that column's default value; if there is no suffix, the default value is `\N` (`null`).

In each data row, the last column holds the `column:value` pairs (the colon is always mandatory) for the sparse
columns whose value, on that row, differs from the default declared in the header. Pairs are also separated by
a physical space (`\s` for a literal space inside a value). Columns that hold their default value on a given row
don't need to be listed there.

At the `fields`/`rows` level there is no difference at all between a regular column and a sparse one: the
underlying table is a plain, ordinary flat table (the same one you'd use to populate a database, for example),
and `fields` includes the sparse column names too. Being sparse is only a way of *serializing* that table into
the `.tab` file, to economize on diffs — see `columnDefs` below.
[!--lang:*-->

```ts
c2|c3|num|en_name|sp_name|\: estrellas mediterraneo:false
AF|AFG|004|Afghanistan|Afganistán|
AL|ALB|008|Albania|Albania|
DE|DEU|276|Germany|Alemania|
AD|AND|020|Andorra|Andorra|mediterraneo:true
AO|AGO|024|Angola|Angola|
AI|AIA|660|Anguila|Anguila|
AG|ATG|028|Antigua y Barbuda|Antigua and Barbuda|
SA|SAU|682|Saudi Arabia|Arabia Saudita|
DZ|DZA|012|Argelia|Algeria|mediterraneo:true
AR|ARG|032|Argentina|Argentina|estrellas:3
```

<!--lang:es-->
## Casos ambiguos en una fila

Al parsear una fila de datos pueden aparecer tres situaciones ambiguas dentro de la columna esparsa:

* un nombre de columna sin `:` (ej. `mediterraneo` a secas);
* la misma columna repetida más de una vez (ej. `mediterraneo:true mediterraneo:false`);
* una columna que no fue declarada en el encabezado.

Por defecto (modo estricto) las tres situaciones lanzan una excepción.
<!--lang:en--]
## Ambiguous cases in a row

When parsing a data row, three ambiguous situations can show up inside the sparse column:

* a column name without a `:` (e.g. plain `mediterraneo`);
* the same column repeated more than once (e.g. `mediterraneo:true mediterraneo:false`);
* a column that was not declared in the header.

By default (strict mode) all three situations throw.
[!--lang:*-->

<!--lang:es-->
### Las opciones `strict`, `defaultValue`, `repeatedColumn` y `unknownColumn`
<!--lang:en--]
### The `strict`, `defaultValue`, `repeatedColumn` and `unknownColumn` options
[!--lang:*-->

<!--lang:es-->
`parseTab` y `parseRow` aceptan estas cuatro propiedades directamente en `options` (al mismo nivel que
`emptyField` u `objectRows`, no anidadas). Por ahora solo las usa el parseo de la columna esparsa, pero se
dejan a nivel `options` porque tiene sentido que en el futuro se reutilicen para otras ambigüedades de parseo
que no son específicas de columnas esparsas (por ejemplo, una fila con más o menos campos que `fields`).

* sin `options.strict`, o con `{strict: true}`: modo estricto (el default); cualquiera de los tres casos
  ambiguos de arriba lanza una excepción, y `defaultValue`, `repeatedColumn` y `unknownColumn` no se usan.
* con `{strict: false, defaultValue, repeatedColumn, unknownColumn}`: modo permisivo. Las tres opciones
  restantes son obligatorias en este modo — si falta alguna, se lanza una excepción. Sus significados son:
  * `defaultValue: FieldValue` — valor a usar cuando una columna aparece sin `:` en la fila.
  * `repeatedColumn: 'first' | 'last'` — qué ocurrencia usar cuando una columna se repite en la misma fila.
  * `unknownColumn: string` — nombre de la columna de columnas no especificadas, donde van a parar los pares
    no declarados en el encabezado. Esa columna existe en todas las filas (con el valor por defecto `null`
    cuando no hay ninguna en esa fila) y, cuando sí las hay, contiene el texto crudo tal cual aparecería en la
    sintaxis esparsa: `'columnaNoDeclarada1:valor1 columnaNoDeclarada2:valor2'`.

El paquete exporta `tabPlus.permissiveOptions`, un objeto con valores sugeridos para el modo permisivo, listo
para mezclar en `options`.
<!--lang:en--]
`parseTab` and `parseRow` accept these four properties directly on `options` (at the same level as
`emptyField` or `objectRows`, not nested). For now only the sparse-column parsing uses them, but they're kept
at the `options` level because it makes sense to reuse them later for other parsing ambiguities that aren't
specific to sparse columns (for example, a row with more or fewer fields than `fields`).

* without `options.strict`, or with `{strict: true}`: strict mode (the default); any of the three ambiguous
  cases above throws, and `defaultValue`, `repeatedColumn` and `unknownColumn` are not used.
* with `{strict: false, defaultValue, repeatedColumn, unknownColumn}`: permissive mode. The other three
  options are mandatory in this mode — if any is missing, it throws. Their meanings are:
  * `defaultValue: FieldValue` — value to use when a column appears without a `:` in the row.
  * `repeatedColumn: 'first' | 'last'` — which occurrence to use when a column repeats within the same row.
  * `unknownColumn: string` — name of the unspecified-columns column, where undeclared pairs land. That
    column exists on every row (with the default value `null` when there are none on that row) and, when
    there are, holds the raw text exactly as it would appear in sparse syntax:
    `'undeclaredColumn1:value1 undeclaredColumn2:value2'`.

The package exports `tabPlus.permissiveOptions`, an object with suggested values for permissive mode, ready to
mix into `options`.
[!--lang:*-->

```js
tabPlus.parseTab(text, {...tabPlus.permissiveOptions});
```

<!--lang:es-->
## `columnDefs`

`parseTab` devuelve, además de `fields` y `rows`, un `columnDefs`: un objeto con una entrada por cada columna
—tanto las columnas comunes como las esparsas— usando el nombre de columna como clave. `fields` incluye a
todas las columnas por igual, esparsas o no (ver la nota sobre esto en la sección de sintaxis).

* una columna común (no esparsa) tiene como valor un objeto vacío `{}`.
* una columna esparsa tiene como valor `{sparseDefault: valor}`, con el valor por defecto declarado en el
  encabezado para esa columna (`null` si no llevaba sufijo `:valor`).

`generateTab` recibe `columnDefs` de la misma forma (junto con `fields` y `rows`) para saber qué columnas debe
emitir como esparsas y con qué valor por defecto. Si una columna presente en `fields`/`rows` no tiene entrada
en `columnDefs`, `generateTab` la trata como esparsa con `sparseDefault: null`.
<!--lang:en--]
## `columnDefs`

Besides `fields` and `rows`, `parseTab` returns a `columnDefs`: an object with one entry per column — both
regular and sparse columns — keyed by column name. `fields` includes every column alike, sparse or not (see
the note about this in the syntax section).

* a regular (non-sparse) column has an empty object `{}` as its value.
* a sparse column has `{sparseDefault: value}` as its value, with the default value declared in the header for
  that column (`null` if it had no `:value` suffix).

`generateTab` receives `columnDefs` the same way (alongside `fields` and `rows`) to know which columns to emit
as sparse and with which default value. If a column present in `fields`/`rows` has no entry in `columnDefs`,
`generateTab` treats it as sparse with `sparseDefault: null`.
[!--lang:*-->

```js
tabPlus.parseTab(
  'c2|c3|num|en_name|sp_name|\\: estrellas mediterraneo:false\r\n' +
  'AR|ARG|032|Argentina|Argentina|estrellas:3\r\n'
);
/* =>
{
  fields: ['c2', 'c3', 'num', 'en_name', 'sp_name', 'estrellas', 'mediterraneo'],
  columnDefs: {
    c2: {}, c3: {}, num: {}, en_name: {}, sp_name: {},
    estrellas: {sparseDefault: null},
    mediterraneo: {sparseDefault: 'false'}
  },
  rows: [['AR', 'ARG', '032', 'Argentina', 'Argentina', '3', null]]
}
*/
```

<!--lang:es-->
> **Nota:** este documento describe el diseño propuesto para columnas esparsas; todavía no está implementado en
> el código de `tab-plus`. Los ejemplos de `parseTab`/`generateTab` de arriba muestran la forma esperada de la
> API, no una API ya disponible.
<!--lang:en--]
> **Note:** this document describes the proposed design for sparse columns; it is not yet implemented in
> `tab-plus`'s code. The `parseTab`/`generateTab` examples above show the expected shape of the API, not an
> already available one.
[!--lang:*-->
