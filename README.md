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

The **generator** in this library always produces output that is safe to split "raw": splitting the generated
text by line breaks always separates records, and splitting a line by `|` always separates fields. This means it
never emits an escaped `|` (`\|`) — a literal `|` in a value is always generated as `\x7C` instead — and every
`\r`, `\n`, `\\` and tab is always escaped.

## Install

```
npm install tab-plus
```

## API

```js
var tabPlus = require('tab-plus');
```

### `tabPlus.parseTab(text)`

Parses the full content of a `.tab` file. Returns `{fields, rows}` where `fields` is an array of column names and
`rows` is an array of arrays of field values (strings).

```js
tabPlus.parseTab('a|b\r\n1|2\r\n');
// => {fields: ['a', 'b'], rows: [['1', '2']]}
```

### `tabPlus.generateTab(tab)`

Generates the full content of a `.tab` file from `{fields, rows}` (the inverse of `parseTab`).

```js
tabPlus.generateTab({fields: ['a', 'b'], rows: [['1', '2']]});
// => 'a|b\r\n1|2\r\n'
```

### `tabPlus.parseRow(rawRow)`

Parses a single raw line (without its line break) into an array of field values.

### `tabPlus.generateRow(row)`

Generates a single raw line (without a line break) from an array of field values.

### `tabPlus.escapeField(value)` / `tabPlus.unescapeField(rawValue)`

Escape/unescape a single field's value.

## License

MIT
