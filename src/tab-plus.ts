export type FieldValue = string | null | symbol;

export interface Options {
    emptyField?: 'string' | 'null' | symbol;
    objectRows?: boolean;
    eol?: string;
    strict?: boolean;
    defaultValue?: FieldValue;
    repeatedColumn?: 'first' | 'last';
    unknownColumn?: string;
}

// suggested values for options.strict/defaultValue/repeatedColumn/unknownColumn in permissive mode; spread
// into options (e.g. {...tabPlus.permissiveOptions}) to opt out of throwing on the sparse-column ambiguities
export const permissiveOptions: {strict: false; defaultValue: FieldValue; repeatedColumn: 'first' | 'last'; unknownColumn: string} = {
    strict: false,
    defaultValue: null,
    repeatedColumn: 'last',
    unknownColumn: '\\:unknown'
};

// a regular column just needs its position (1-based, among regular columns) to fix its place in a row; a
// sparse column also carries the default value declared for it in the header's `\:` section
export interface ColumnDef {
    position: number;
    sparseDefault?: FieldValue;
}

export type ColumnDefs = {[field: string]: ColumnDef};

declare const process: {platform: string} | undefined;
declare const navigator: {platform?: string; userAgent?: string} | undefined;

// options.eol (generateTab/getGenerateTransformer): line ending to join generated lines with. Defaults to
// the running OS's native ending, detected without a static dependency on Node's `os` module, so this file
// stays usable unmodified both under Node and bundled for the browser (where there is no such module).
function detectEol(): string {
    if(typeof process !== 'undefined' && /^win/i.test(process.platform)){
        return '\r\n';
    }
    if(typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || navigator.userAgent || '')){
        return '\r\n';
    }
    return '\n';
}

export interface Tab {
    fields: FieldValue[];
    columnDefs?: ColumnDefs;
    rows: FieldValue[][];
}

export type RowObject = {[field: string]: FieldValue};

export interface ObjectTab {
    fields: FieldValue[];
    columnDefs?: ColumnDefs;
    rows: RowObject[];
}

// a field separator '|' is only a separator when not escaped by an odd number of preceding backslashes
const unescapedPipe = /(?<!(?:^|[^\\])(?:\\\\)*\\)\|/;

// same "not escaped" rule as unescapedPipe, but for the physical space that separates sparse-column entries
// (either "name" / "name:default" in the header, or "column:value" pairs in a data row)
const unescapedSpace = /(?<!(?:^|[^\\])(?:\\\\)*\\) /;

// marks the header's last field as the start of the sparse-columns section: `\:` followed by the
// space-separated `name` / `name:default` entries
const sparseHeaderMarker = /^\\: ?/;

// a backslash escape: either a single non-'x' char (\t \r \n \s \\ \| ...) or \xHH (1 or 2 hex digits)
const escapeSequence = /\\([^x]|x[\dA-Za-z]{1,2})/g;

const commentOrBlankLine = /^[-| ]*$/;

// eslint-disable-next-line no-control-regex -- control chars are intentional: this is the list of chars that must be escaped in fields
const charsNeedingEscape = /[\\|\r\n\t\x00-\x1f\x7f]/g;

// whole-field markers: explicit empty string and explicit null, regardless of the `emptyField` option
const explicitEmpty = '\\E';
const explicitNull = '\\N';

function toHex(char: string): string {
    return '\\x' + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
}

// options.emptyField: how a field with no content at all (adjacent separators, e.g. `a||b`) is parsed/generated:
// 'string' (default, backwards compatible) means it is an empty string; 'null' means it is `null`; passing a
// symbol means it is that symbol (handy as a sentinel distinct from any real string or `null` value).
// Regardless of this option, `\E` always means an explicit empty string and `\N` always means an explicit `null`.
function emptyFieldValue(options?: Options): FieldValue {
    const emptyField = options && options.emptyField;
    if(emptyField === 'null'){
        return null;
    }
    if(typeof emptyField === 'symbol'){
        return emptyField;
    }
    return '';
}

// turns the raw (still escaped) text of one field into its real value
export function unescapeField(rawValue: string, options?: Options): FieldValue {
    const trimmed = rawValue.trimEnd();
    if(trimmed === explicitEmpty){
        return '';
    }
    if(trimmed === explicitNull){
        return null;
    }
    if(trimmed === ''){
        return emptyFieldValue(options);
    }
    return trimmed.replace(escapeSequence, function(_substring: string, escaped: string): string {
        switch(escaped){
            case 't': return '\t';
            case 'r': return '\r';
            case 'n': return '\n';
            case 's': return ' ';
            default: return escaped.charAt(0) === 'x' ? String.fromCodePoint(parseInt(escaped.slice(1), 16)) : escaped;
        }
    });
}

// turns a field's real value into raw (escaped) text safe to embed between '|' separators
export function escapeField(value: FieldValue | undefined, options?: Options): string {
    const emptyValue = emptyFieldValue(options);
    if(value == null){
        value = null;
    }
    if(value === emptyValue){
        return '';
    }
    if(value === null){
        return explicitNull;
    }
    if(value === ''){
        return explicitEmpty;
    }
    if(typeof value === 'symbol'){
        throw new TypeError('tab-plus: cannot generate a field for symbol ' + value.toString() +
            ', it does not match options.emptyField');
    }
    return value.replace(charsNeedingEscape, function(char: string): string {
        switch(char){
            case '\\': return '\\\\';
            case '\r': return '\\r';
            case '\n': return '\\n';
            case '\t': return '\\t';
            default: return toHex(char);
        }
    });
}

// columnDefs field names in the order parseRow/generateRow lay them out in a plain row array: common columns
// first (by position), then sparse columns (by position, separately numbered) - the same order columnDefs
// entries are documented to declare
function orderedFieldsOf(columnDefs: ColumnDefs): {common: string[]; sparse: string[]} {
    const common: string[] = [];
    const sparse: string[] = [];
    Object.keys(columnDefs).forEach(function(field){
        (columnDefs[field].sparseDefault === undefined ? common : sparse).push(field);
    });
    function byPosition(a: string, b: string): number {
        return columnDefs[a].position - columnDefs[b].position;
    }
    return {common: common.sort(byPosition), sparse: sparse.sort(byPosition)};
}

// splits the (still escaped) name:value text of one sparse-column pair on its first unescaped ':'
function splitSparsePair(rawPair: string): {rawName: string; rawValue: string} | null {
    const colonIndex = rawPair.search(/(?<!(?:^|[^\\])(?:\\\\)*\\):/);
    return colonIndex === -1 ? null : {rawName: rawPair.slice(0, colonIndex), rawValue: rawPair.slice(colonIndex + 1)};
}

// parses the raw text of the trailing sparse-columns field of a data row into a Map from column name to raw
// (still escaped) value text. In strict mode (the default) throws on any of: a pair without ':', the same
// column repeated, or a column not declared in `sparseFields`. In permissive mode (options.strict === false)
// a missing ':' uses options.defaultValue, a repeated column keeps the first or last occurrence per
// options.repeatedColumn, and an undeclared column's raw "name:value" text is appended to options.unknownColumn
// (itself expected to be one of `sparseFields`, typically added there by the columnDefs' owner) - see the
// `unknownColumn` doc section for why that column's generated value must already look like sparse syntax.
function parseSparseBlock(rawBlock: string, sparseFields: string[], options?: Options): Map<string, string> {
    const strict = !options || options.strict !== false;
    const parsed = new Map<string, string>();
    const leftovers: string[] = [];
    if(rawBlock !== ''){
        rawBlock.split(unescapedSpace).forEach(function(rawPair){
            const split = splitSparsePair(rawPair);
            if(split === null){
                if(strict){
                    throw new Error('tab-plus: sparse column "' + rawPair + '" is missing its ":" (strict mode)');
                }
                parsed.set(rawPair, escapeField(options!.defaultValue));
                return;
            }
            const field = String(unescapeField(split.rawName));
            if(sparseFields.indexOf(field) === -1){
                if(strict){
                    throw new Error('tab-plus: sparse column "' + field + '" is not declared in the header (strict mode)');
                }
                leftovers.push(rawPair);
                return;
            }
            if(parsed.has(field)){
                if(strict){
                    throw new Error('tab-plus: sparse column "' + field + '" appears more than once in the same row (strict mode)');
                }
                if(options!.repeatedColumn === 'first'){
                    return;
                }
            }
            parsed.set(field, split.rawValue);
        });
    }
    if(leftovers.length > 0 && options && options.unknownColumn){
        parsed.set(options.unknownColumn, escapeField(leftovers.join(' ')));
    }
    return parsed;
}

// generates the raw text of the trailing sparse-columns field of a data row: 'name:value' pairs (in
// sparseFields order) for the columns whose value differs from its columnDefs.sparseDefault
function generateSparseBlock(values: Map<string, FieldValue | undefined>, sparseFields: string[], columnDefs: ColumnDefs): string {
    return sparseFields.filter(function(field){
        return values.get(field) !== columnDefs[field].sparseDefault;
    }).map(function(field){
        return escapeField(field).replace(/ /g, '\\s') + ':' + escapeField(values.get(field));
    }).join(' ');
}

// parses one raw line (without CR/LF) into an array of field values. Without columnDefs, or with columnDefs
// that declares no sparse columns, this is unchanged from the pre-sparse-columns behavior: one value per '|'
// separated field. With sparse columns declared, the row is expected to carry one extra trailing field (the
// sparse-columns block), and the returned array has one entry per column, common columns first (in columnDefs
// position order) followed by sparse columns (in their own columnDefs position order) - see the `columnDefs`
// doc section.
export function parseRow(rawRow: string, options?: Options, columnDefs?: ColumnDefs): FieldValue[] {
    const rawFields = rawRow.split(unescapedPipe);
    if(!columnDefs){
        return rawFields.map(function(rawValue){
            return unescapeField(rawValue, options);
        });
    }
    const {common, sparse} = orderedFieldsOf(columnDefs);
    if(sparse.length === 0){
        return rawFields.map(function(rawValue){
            return unescapeField(rawValue, options);
        });
    }
    if(rawFields.length !== common.length + 1){
        throw new Error('tab-plus: row has ' + rawFields.length + ' fields, expected ' +
            (common.length + 1) + ' (' + common.length + ' common + 1 sparse-columns block)');
    }
    const commonValues = rawFields.slice(0, common.length).map(function(rawValue){
        return unescapeField(rawValue, options);
    });
    const parsedSparse = parseSparseBlock(rawFields[common.length], sparse, options);
    const sparseValues = sparse.map(function(field){
        return parsedSparse.has(field) ? unescapeField(parsedSparse.get(field)!, options) : columnDefs[field].sparseDefault!;
    });
    return commonValues.concat(sparseValues);
}

// generates one raw line (without CR/LF) from an array of field values. Without columnDefs, or with
// columnDefs that declares no sparse columns, this is unchanged from the pre-sparse-columns behavior. With
// sparse columns declared, `row` is expected in the same order parseRow returns (common columns then sparse
// columns, both by columnDefs position); this function splits it back into the common '|' separated fields
// plus a trailing sparse-columns block, only emitting the columns that differ from their sparseDefault.
export function generateRow(row: (FieldValue | undefined)[], options?: Options, columnDefs?: ColumnDefs): string {
    if(!columnDefs){
        return row.map(function(value){
            return escapeField(value, options);
        }).join('|');
    }
    const {common, sparse} = orderedFieldsOf(columnDefs);
    if(sparse.length === 0){
        return row.map(function(value){
            return escapeField(value, options);
        }).join('|');
    }
    const commonRaw = row.slice(0, common.length).map(function(value){
        return escapeField(value, options);
    });
    const values = new Map<string, FieldValue | undefined>();
    sparse.forEach(function(field, i){
        values.set(field, row[common.length + i]);
    });
    return commonRaw.concat([generateSparseBlock(values, sparse, columnDefs)]).join('|');
}

function rowToObject(fields: FieldValue[], row: FieldValue[]): RowObject {
    const obj: RowObject = {};
    fields.forEach(function(field, i){
        obj[typeof field === 'string' ? field : String(field)] = row[i];
    });
    return obj;
}

function objectRowToArray(fields: FieldValue[], row: RowObject): (FieldValue | undefined)[] {
    return fields.map(function(field){
        return row[typeof field === 'string' ? field : String(field)];
    });
}

// a columnDefs with no sparse columns at all: every field is common, in array order
function plainColumnDefs(fields: FieldValue[]): ColumnDefs {
    const columnDefs: ColumnDefs = {};
    fields.forEach(function(field, i){
        columnDefs[String(field)] = {position: i + 1};
    });
    return columnDefs;
}

// true if a raw line must be skipped entirely (comment, blank, or a single implicitly-empty field)
function isSkippableLine(line: string): boolean {
    if(commentOrBlankLine.test(line)){
        return true;
    }
    const rawFields = line.split(unescapedPipe);
    return rawFields.length === 1 && rawFields[0].trim() === '';
}

// parses a header line's raw (still '|' split, not yet unescaped) fields into {fields, columnDefs}. The last
// raw field starts the sparse-columns section when it begins with the literal `\:` marker; each subsequent
// space-separated entry is a sparse column's `name` (default `\N`/null) or `name:default`. Without that
// marker, there are no sparse columns. `fields` lists common columns first, then sparse ones (see the
// `columnDefs` doc section); options.unknownColumn, when given, is appended as one more sparse column
// (default null) if the header didn't already declare it.
function parseHeaderFields(rawFields: string[], options?: Options): {fields: FieldValue[]; columnDefs: ColumnDefs} {
    const lastRaw = rawFields[rawFields.length - 1];
    const hasSparseSection = rawFields.length > 0 && lastRaw !== undefined && sparseHeaderMarker.test(lastRaw);
    const commonRaw = hasSparseSection ? rawFields.slice(0, -1) : rawFields;
    const commonFields = commonRaw.map(function(rawValue){
        return unescapeField(rawValue, options);
    });
    const columnDefs: ColumnDefs = {};
    commonFields.forEach(function(field, i){
        columnDefs[String(field)] = {position: i + 1};
    });
    const sparseEntries: string[] = hasSparseSection ? lastRaw.replace(sparseHeaderMarker, '').split(unescapedSpace) : [];
    const sparseFields = sparseEntries.filter(function(rawEntry){ return rawEntry !== ''; }).map(function(rawEntry, i){
        const split = splitSparsePair(rawEntry);
        const field = String(unescapeField(split ? split.rawName : rawEntry));
        columnDefs[field] = {position: i + 1, sparseDefault: split ? unescapeField(split.rawValue, options) : null};
        return field;
    });
    if(options && options.unknownColumn && !Object.prototype.hasOwnProperty.call(columnDefs, options.unknownColumn)){
        columnDefs[options.unknownColumn] = {position: sparseFields.length + 1, sparseDefault: null};
        sparseFields.push(options.unknownColumn);
    }
    return {fields: commonFields.concat(sparseFields), columnDefs};
}

// generates a header line from {fields, columnDefs}: common columns '|' separated as usual, followed (only
// when columnDefs declares at least one sparse column) by the `\:` marker and the space-separated
// `name`/`name:default` entries, in columnDefs position order - the inverse of parseHeaderFields
function generateHeaderFields(fields: FieldValue[], columnDefs: ColumnDefs, options?: Options): string {
    const {common, sparse} = orderedFieldsOf(columnDefs);
    const commonRaw = fields.slice(0, common.length).map(function(field){
        return escapeField(field, options);
    });
    if(sparse.length === 0){
        return commonRaw.join('|');
    }
    const sparseRaw = sparse.map(function(field){
        const rawName = escapeField(field).replace(/ /g, '\\s');
        const sparseDefault = columnDefs[field].sparseDefault!;
        return sparseDefault === null ? rawName : rawName + ':' + escapeField(sparseDefault, options);
    });
    return commonRaw.concat(['\\: ' + sparseRaw.join(' ')]).join('|');
}

function asError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err));
}

// the transformers below follow the (data, callback) contract expected by parallel-transform:
// callback(err) reports an error, callback(null, null) emits nothing, callback(null, data) emits data
export type TransformerCallback<T> = (err: Error | null, data?: T | null) => void;

export interface ParseTransformer<T extends FieldValue[] | RowObject = FieldValue[] | RowObject> {
    (line: string, callback: TransformerCallback<T>): void;
    fields: FieldValue[] | null;
    columnDefs: ColumnDefs | null;
}

export interface GenerateTransformer {
    (row: (FieldValue | undefined)[] | RowObject, callback: TransformerCallback<string | string[]>): void;
    fields: FieldValue[] | null;
    columnDefs: ColumnDefs | null;
}

// returns a stateful line-by-line parser: the first real line (not comment/blank, BOM stripped) is kept as
// `fields`/`columnDefs` (see parseHeaderFields for how the header's optional `\:` sparse-columns section is
// read into columnDefs). In array mode (the default) that first line is also emitted as the first row,
// symmetric with getGenerateTransformer's array mode (which likewise expects the header as its first row);
// in object mode it is not re-emitted, since every emitted object already carries the field names as its own
// keys. Subsequent lines are parsed with parseRow using the stored columnDefs, so a row with sparse columns
// declared carries one plain value per column, common columns first then sparse ones (see parseRow).
export function getParseTransformer(options?: Options & {objectRows?: false}): ParseTransformer<FieldValue[]>;
export function getParseTransformer(options: Options & {objectRows: true}): ParseTransformer<RowObject>;
export function getParseTransformer(options?: Options): ParseTransformer;
export function getParseTransformer(options?: Options): ParseTransformer {
    const transformer: ParseTransformer = Object.assign(
        function(line: string, callback: TransformerCallback<FieldValue[] | RowObject>): void {
            try{
                if(isSkippableLine(line)){
                    return callback(null, null);
                }
                if(transformer.fields === null){
                    const rawFields = line.split(unescapedPipe);
                    const {fields, columnDefs} = parseHeaderFields(rawFields, options);
                    const firstField = fields[0];
                    if(typeof firstField === 'string' && firstField.charCodeAt(0) === 0xfeff){
                        fields[0] = firstField.slice(1);
                    }
                    transformer.fields = fields;
                    transformer.columnDefs = columnDefs;
                    return callback(null, options && options.objectRows ? null : fields);
                }
                const row = parseRow(line, options, transformer.columnDefs!);
                return callback(null, options && options.objectRows ? rowToObject(transformer.fields, row) : row);
            }catch(err){
                return callback(asError(err));
            }
        },
        {fields: null as FieldValue[] | null, columnDefs: null as ColumnDefs | null}
    );
    return transformer;
}

// returns the opposite stateful transformer: receives one row per call and emits the line(s) of text,
// without line terminator. The first call defines `fields`/`columnDefs`: an array is the header itself
// (emits one line, columnDefs derived so every field just gets its 1-based position, no sparse columns -
// generateTab is the entry point for producing sparse output, see there); an object serves both as header
// (its keys) and as data (emits [header line, data line])
export function getGenerateTransformer(options?: Options): GenerateTransformer {
    const transformer: GenerateTransformer = Object.assign(
        function(row: (FieldValue | undefined)[] | RowObject, callback: TransformerCallback<string | string[]>): void {
            try{
                if(transformer.fields === null){
                    const fields = Array.isArray(row) ? row.map(function(value){ return value === undefined ? null : value; }) : Object.keys(row);
                    transformer.fields = fields;
                    if(transformer.columnDefs === null){
                        transformer.columnDefs = plainColumnDefs(fields);
                    }
                    const headerLine = generateHeaderFields(fields, transformer.columnDefs, options);
                    if(Array.isArray(row)){
                        return callback(null, headerLine);
                    }
                    return callback(null, [headerLine, generateRow(objectRowToArray(fields, row), options, transformer.columnDefs)]);
                }
                return callback(null, generateRow(
                    Array.isArray(row) ? row : objectRowToArray(transformer.fields, row),
                    options,
                    transformer.columnDefs!
                ));
            }catch(err){
                return callback(asError(err));
            }
        },
        {fields: null as FieldValue[] | null, columnDefs: null as ColumnDefs | null}
    );
    return transformer;
}

// parses the full content of a .tab file into {fields, rows}
export function parseTab(text: string, options?: Options & {objectRows?: false}): Tab;
export function parseTab(text: string, options: Options & {objectRows: true}): ObjectTab;
export function parseTab(text: string, options?: Options): Tab | ObjectTab {
    const transformer = getParseTransformer(options);
    const rows: (FieldValue[] | RowObject)[] = [];
    String(text).split(/\r?\n/).forEach(function(line){
        transformer(line, function(err, row){
            if(err){ throw err; }
            // in array mode the transformer emits the header as the first row too; skip it here, it is
            // already available as transformer.fields
            if(row != null && row !== transformer.fields){ rows.push(row); }
        });
    });
    // omit columnDefs entirely when there are no sparse columns, so the result is unchanged, byte for byte,
    // from before sparse columns existed (see the `columnDefs` doc section)
    const hasSparseColumns = !!transformer.columnDefs && Object.keys(transformer.columnDefs).some(function(field){
        return transformer.columnDefs![field].sparseDefault !== undefined;
    });
    const result: Tab | ObjectTab = {fields: transformer.fields || [], rows: rows} as Tab | ObjectTab;
    if(hasSparseColumns){
        result.columnDefs = transformer.columnDefs!;
    }
    return result;
}

// generates the full content of a .tab file from {fields, columnDefs, rows} (rows can be arrays or, as
// returned by parseTab with objectRows:true, objects keyed by field name). Without `columnDefs` (e.g. a Tab
// built by hand without one, as returned by older versions of this library), every column is generated as a
// plain common one - unchanged, backwards-compatible behavior. With `columnDefs` given (see the doc's
// `columnDefs` section) it drives which columns are emitted as sparse and with what default; a column present
// in `fields` but missing from `columnDefs` is then treated as sparse with a null default, appended after the
// already-declared sparse columns.
export function generateTab(tab: Tab | ObjectTab, options?: Options): string {
    const transformer = getGenerateTransformer(options);
    const declared = tab.columnDefs;
    if(declared){
        const columnDefs: ColumnDefs = Object.assign({}, declared);
        let nextSparsePosition = Object.keys(declared).filter(function(field){
            return declared[field].sparseDefault !== undefined;
        }).length;
        tab.fields.forEach(function(field){
            const key = String(field);
            if(!Object.prototype.hasOwnProperty.call(columnDefs, key)){
                nextSparsePosition += 1;
                columnDefs[key] = {position: nextSparsePosition, sparseDefault: null};
            }
        });
        transformer.columnDefs = columnDefs;
    }
    const eol = (options && options.eol) || detectEol();
    let result = '';
    function append(err: Error | null, lines?: string | string[] | null): void {
        if(err){ throw err; }
        if(lines != null){
            (Array.isArray(lines) ? lines : [lines]).forEach(function(line){
                result += line + eol;
            });
        }
    }
    transformer(tab.fields, append);
    tab.rows.forEach(function(row){
        transformer(row, append);
    });
    return result;
}
