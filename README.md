# tab-plus


Parser and generator for a safe variant of the pipe-separated format.


[![npm-version](https://img.shields.io/npm/v/tab-plus.svg)](https://npmjs.org/package/tab-plus)
[![downloads](https://img.shields.io/npm/dm/tab-plus.svg)](https://npmjs.org/package/tab-plus)
[![build](https://github.com/ari-dc-uba-ar/tab-plus/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/ari-dc-uba-ar/tab-plus/actions/workflows/build-and-test.yml)
[![security](https://socket.dev/api/badge/npm/package/tab-plus)](https://socket.dev/npm/package/tab-plus)
[![qa-control](https://github.com/ari-dc-uba-ar/tab-plus/actions/workflows/qa-control.yml/badge.svg)](https://github.com/ari-dc-uba-ar/tab-plus/actions/workflows/qa-control.yml)


language: ![English](https://raw.githubusercontent.com/codenautas/multilang/master/img/lang-en.png)
also available in:
[![Spanish](https://raw.githubusercontent.com/codenautas/multilang/master/img/lang-es.png)](LEEME.md)

## Use

Suppose we have the following file
```ts
c2|c3|num|en_name|sp_name
AF|AFG|004|Afghanistan|Afganistán
AL|ALB|008|Albania|Albania
DE|DEU|276|Germany|Alemania
AD|AND|020|Andorra|Andorra
AO|AGO|024|Angola|Angola
AI|AIA|660|Anguila|Anguila
AG|ATG|028|Antigua y Barbuda|Antigua and Barbuda
SA|SAU|682|Saudi Arabia|Arabia Saudita
DZ|DZA|012|Argelia|Algeria
AR|ARG|032|Argentina|Argentina
```

Let's load the file, make some changes and save it back
```ts
import { parseTab, generateTab } from "tab-plus";
import * as fs from "fs/promise";

var textContent = await fs.readFile('countries.tab', 'utf-8');
var info = parseTab(textContent)

console.log(info);
var orderedInfo = {
  fields: info.fields,
  rows: sortArrayOfArrays(info.rows)
}

var textToSave = generateTab(orderedInfo);
await fs.writeFile(textToSave, 'utf-8');
```

## Why `.tab`

`.tab` is the safest format for exchanging tabular data when you don't know for sure who is going to read it.
CSV has no single standard, and its most common variants allow literal line breaks inside a quoted field. That
means a CSV parser can't rely on the file's physical line breaks to know where each record ends — it has to
keep track of whether it's "inside" or "outside" quotes, and even counting records stops being trivial without
a full parser.

In `.tab`, on the other hand, a physical line break always separates records and a `|` always separates
fields — neither can ever appear literally inside a value, because the generator always replaces them with a
code (`\r\n`, `\n`, or `\x7C` for a `|` that is not a separator). There's no state to keep track of (like
counting backslashes) to decide whether a `|` is a separator: if it appears as-is, it always is.

This guarantee depends, of course, on whoever generates the file following the escaping rules — no format is
safe if the producer doesn't follow them. The advantage of `.tab` is on the *reading* side, for careless
readers: the worst outcome of a naive parser (one that doesn't even resolve escape sequences) is finding a
sequence like `\x7C` in a field's content instead of the `|` character — a cosmetic defect, local to that
field. Records never get cut, columns never get misaligned, and one row never bleeds into the next. With
quoted CSV, on the other hand, a careless parser hitting a comma or a line break inside quotes produces much
more serious, silent failures: split records, shifted columns, wrong row counts. And precisely because CSV is
such a well-known format, it's common for it to be implemented "by hand" naively, trusting that splitting on
commas is enough.

## The `tab-plus` format

* Records are separated by lines (`\r\n` or `\n`).
* Fields within a record are separated by `|`.
* The first record is the header (field names); the rest are data rows.
* `\` is the escape character. It can produce:
  * `\t`, `\r`, `\n`, `\s`, `\\` for tab, carriage return, line feed, space and the backslash itself.
  * `\xHH` for any byte, given as a 2 digit hex code (this is mandatory for `|`, whose code is `\x7C`, and
    recommended for special characters that are not in the list above, are not standard UTF-8, or are not
    visible/printable).
  * `\E` and `\N` can only appear as a field's whole value and mean a zero-length string `''` or the value
    `null` respectively. Two consecutive separators `||` produce the same as `\E` or `\N`, depending on which
    `emptyField` option is used.
  * `\` followed by any other character has reserved behavior that may change in future versions (although the
    current parser yields the character that follows literally, `|` included).
* Trailing whitespace on a field is trimmed. This trimming happens on the raw (still escaped) text before
  escape sequences are resolved, so it only removes literal trailing spaces/tabs — a trailing `\s` (or any
  other escape sequence) is not affected and is kept in the resulting value.
* A leading UTF-8 BOM on the first header field is stripped.

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

### The `objectRows` option

By default `parseTab` returns `rows` as an array of arrays (one value per column, in the same order as
`fields`). With `{objectRows: true}` it instead returns an array of objects, one per row, with the column
names as attributes.

`generateTab` accepts either shape indistinctly (no need to pass the option): it detects, row by row, whether
it's an array or an object.

```js
tabPlus.parseTab('a|b\r\n1|2\r\n', {objectRows: true});
// => {fields: ['a', 'b'], rows: [{a: '1', b: '2'}]}
tabPlus.generateTab({fields: ['a', 'b'], rows: [{a: '1', b: '2'}]});
// => 'a|b\r\n1|2\r\n'
```

## Install

```
npm install tab-plus
```

The library is written in TypeScript and ships its own type declarations (`dist/tab-plus.d.ts`); no `@types`
package is needed.

## CLI: `tab-plus sparse`

The package installs a `tab-plus` command with a `sparse` subcommand that converts a plain `.tab` file into one
that uses [sparse columns](tab-plus.md) for the columns that are almost always `\N` (`null`) or `false`.

```
tab-plus sparse FILE.tab [options]
```

For each column it computes what percentage of rows differ from `null` and what percentage differ from
`'false'`. If either is under the threshold, the column becomes sparse against that default (null is tried
first); otherwise the column stays a regular column. The output file is the original name with a `-sparse`
suffix before the extension (e.g. `countries.tab` → `countries-sparse.tab`), unless `--output` is given.

Options:

* `--under 10%` (default): a column qualifies when fewer than 10% of rows differ from the default — relative
  threshold.
* `--under 10`: absolute variant — the column qualifies when fewer than 10 rows differ from the default.
* `--fixed col1 col2 ...`: forces those columns to stay fixed (non-sparse) regardless of the computation; every
  other column is still decided by `--under` as usual.
* `--sparse col1 col2 ...`: forces those columns to become sparse regardless of the computation (the default is
  whichever of `null`/`'false'` produces fewer differing rows); every other column is still decided by
  `--under` as usual.
* `--output file.tab`: output filename.

> **Note:** this command writes the sparse-column format described in [tab-plus.md](tab-plus.md), but for now
> it is one-way — `tabPlus.parseTab`/`generateTab` don't understand that format yet as such (see the note at
> the bottom of that document), so a `-sparse.tab` file generated by this command can't be read back yet through
> the library's API while honoring the declared defaults.

## API

```js
var tabPlus = require('tab-plus');
```

```ts
import * as tabPlus from 'tab-plus';
```

### `tabPlus.parseTab(text, options)`

Parses the full content of a `.tab` file. Returns `{fields, rows}` where `fields` is an array of column names
and `rows` is an array of arrays of field values (strings, plus `null` or the configured symbol where
applicable — see `emptyField` above), or an array of objects if `{objectRows: true}` is passed (see
`objectRows` above). `options` is optional.

```js
tabPlus.parseTab('a|b\r\n1|2\r\n');
// => {fields: ['a', 'b'], rows: [['1', '2']]}
```

### `tabPlus.generateTab(tab, options)`

Generates the full content of a `.tab` file from `{fields, rows}` (the inverse of `parseTab`), where each row
can be an array or an object (see `objectRows` above). `options` is optional; see the `emptyField` option
above.

```js
tabPlus.generateTab({fields: ['a', 'b'], rows: [['1', '2']]});
// => 'a|b\r\n1|2\r\n'
```

### `tabPlus.parseRow(rawRow, options)`

Parses a single raw line (without its line break) into an array of field values.

### `tabPlus.generateRow(row, options)`

Generates a single raw line (without a line break) from an array of field values.

### `tabPlus.escapeField(value, options)` / `tabPlus.unescapeField(rawValue, options)`

Escape/unescape a single field's value. `escapeField` treats `undefined` exactly like `null` — there's no
separate behavior for a missing array entry vs. an explicit `null`.

### Types

The package exports the TypeScript types `FieldValue` (`string | null | symbol`), `Options` (`{emptyField?:
'string' | 'null' | symbol, objectRows?: boolean}`), `Tab` (`{fields: FieldValue[], rows: FieldValue[][]}`),
`RowObject` (`{[field: string]: FieldValue}`) and `ObjectTab` (`{fields: FieldValue[], rows: RowObject[]}`).

## License

MIT
