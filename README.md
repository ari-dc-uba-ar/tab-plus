# tab-plus

Parser and generator for the `.tab` file format used by [backend-plus](https://github.com/codenautas/backend-plus)
to seed database tables with initial data.

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
`options` argument with an `emptyField` property, either `'string'` (the default) or `'null'`:

* `'string'` (default): a field with no content at all parses as `''`; a `null` value is generated explicitly
  as `\N` (since implicit-empty already means `''`).
* `'null'`: a field with no content at all parses as `null`; an empty string value (`''`) is generated
  explicitly as `\E` (since implicit-empty now means `null`).

In both modes `\E` always parses as `''` and `\N` always parses as `null`, and `generateTab`/`generateRow` never
need to emit them for the "default" value of the chosen mode — only for the non-default one, so a round trip
through `generateTab`/`parseTab` (or `generateRow`/`parseRow`) with the same options always preserves `''` vs
`null`.

```js
tabPlus.parseRow('a||b', {emptyField: 'null'});
// => ['a', null, 'b']
tabPlus.generateRow(['a', null, 'b'], {emptyField: 'null'});
// => 'a||b'
tabPlus.generateRow(['a', '', 'b'], {emptyField: 'null'});
// => 'a|\\E|b'
```

## Install

```
npm install tab-plus
```

The library is written in TypeScript and ships its own type declarations (`dist/tab-plus.d.ts`); no `@types`
package is needed.

## API

```js
var tabPlus = require('tab-plus');
```

```ts
import * as tabPlus from 'tab-plus';
```

### `tabPlus.parseTab(text, options)`

Parses the full content of a `.tab` file. Returns `{fields, rows}` where `fields` is an array of column names and
`rows` is an array of arrays of field values (strings, plus `null` where applicable — see `emptyField` above).
`options` is optional; see the `emptyField` option above.

```js
tabPlus.parseTab('a|b\r\n1|2\r\n');
// => {fields: ['a', 'b'], rows: [['1', '2']]}
```

### `tabPlus.generateTab(tab, options)`

Generates the full content of a `.tab` file from `{fields, rows}` (the inverse of `parseTab`). `options` is
optional; see the `emptyField` option above.

```js
tabPlus.generateTab({fields: ['a', 'b'], rows: [['1', '2']]});
// => 'a|b\r\n1|2\r\n'
```

### `tabPlus.parseRow(rawRow, options)`

Parses a single raw line (without its line break) into an array of field values.

### `tabPlus.generateRow(row, options)`

Generates a single raw line (without a line break) from an array of field values.

### `tabPlus.escapeField(value, options)` / `tabPlus.unescapeField(rawValue, options)`

Escape/unescape a single field's value.

### Types

The package exports the TypeScript types `FieldValue` (`string | null`), `Options` (`{emptyField?: 'string' |
'null'}`) and `Tab` (`{fields: FieldValue[], rows: FieldValue[][]}`).

## License

MIT
