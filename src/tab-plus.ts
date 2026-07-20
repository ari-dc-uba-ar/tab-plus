export type FieldValue = string | null | symbol;

export interface Options {
    emptyField?: 'string' | 'null' | symbol;
    objectRows?: boolean;
}

export interface Tab {
    fields: FieldValue[];
    rows: FieldValue[][];
}

export type RowObject = {[field: string]: FieldValue};

export interface ObjectTab {
    fields: FieldValue[];
    rows: RowObject[];
}

// a field separator '|' is only a separator when not escaped by an odd number of preceding backslashes
const unescapedPipe = /(?<!(?:^|[^\\])(?:\\\\)*\\)\|/;

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

// parses one raw line (without CR/LF) into an array of field values
export function parseRow(rawRow: string, options?: Options): FieldValue[] {
    return rawRow.split(unescapedPipe).map(function(rawValue){
        return unescapeField(rawValue, options);
    });
}

// generates one raw line (without CR/LF) from an array of field values
export function generateRow(row: (FieldValue | undefined)[], options?: Options): string {
    return row.map(function(value){
        return escapeField(value, options);
    }).join('|');
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

// parses one raw line, or returns null if it must be skipped (comment, blank or lone empty field)
function parseDataLine(line: string, options?: Options): FieldValue[] | null {
    if(commentOrBlankLine.test(line)){
        return null;
    }
    const row = parseRow(line, options);
    if(row.length === 1 && typeof row[0] === 'string' && row[0].trim() === ''){
        return null;
    }
    return row;
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
}

export interface GenerateTransformer {
    (row: (FieldValue | undefined)[] | RowObject, callback: TransformerCallback<string | string[]>): void;
    fields: FieldValue[] | null;
}

// returns a stateful line-by-line parser: the first real line (not comment/blank, BOM stripped) is kept
// as `fields`. In array mode (the default) that first line is also emitted as the first row, symmetric with
// getGenerateTransformer's array mode (which likewise expects the header as its first row); in object mode
// it is not re-emitted, since every emitted object already carries the field names as its own keys.
export function getParseTransformer(options?: Options & {objectRows?: false}): ParseTransformer<FieldValue[]>;
export function getParseTransformer(options: Options & {objectRows: true}): ParseTransformer<RowObject>;
export function getParseTransformer(options?: Options): ParseTransformer;
export function getParseTransformer(options?: Options): ParseTransformer {
    const transformer: ParseTransformer = Object.assign(
        function(line: string, callback: TransformerCallback<FieldValue[] | RowObject>): void {
            try{
                const row = parseDataLine(line, options);
                if(row === null){
                    return callback(null, null);
                }
                if(transformer.fields === null){
                    const firstField = row[0];
                    if(typeof firstField === 'string' && firstField.charCodeAt(0) === 0xfeff){
                        row[0] = firstField.slice(1);
                    }
                    transformer.fields = row;
                    return callback(null, options && options.objectRows ? null : row);
                }
                return callback(null, options && options.objectRows ? rowToObject(transformer.fields, row) : row);
            }catch(err){
                return callback(asError(err));
            }
        },
        {fields: null as FieldValue[] | null}
    );
    return transformer;
}

// returns the opposite stateful transformer: receives one row per call and emits the line(s) of text,
// without line terminator. The first call defines `fields`: an array is the header itself (emits one
// line); an object serves both as header (its keys) and as data (emits [header line, data line])
export function getGenerateTransformer(options?: Options): GenerateTransformer {
    const transformer: GenerateTransformer = Object.assign(
        function(row: (FieldValue | undefined)[] | RowObject, callback: TransformerCallback<string | string[]>): void {
            try{
                if(transformer.fields === null){
                    if(Array.isArray(row)){
                        transformer.fields = row.map(function(value){ return value === undefined ? null : value; });
                        return callback(null, generateRow(row, options));
                    }
                    const fields: FieldValue[] = Object.keys(row);
                    transformer.fields = fields;
                    return callback(null, [generateRow(fields, options), generateRow(objectRowToArray(fields, row), options)]);
                }
                return callback(null, generateRow(Array.isArray(row) ? row : objectRowToArray(transformer.fields, row), options));
            }catch(err){
                return callback(asError(err));
            }
        },
        {fields: null as FieldValue[] | null}
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
    // the transformer emits rows homogeneous with options.objectRows, so the union collapses to Tab or ObjectTab
    return {fields: transformer.fields || [], rows: rows} as Tab | ObjectTab;
}

// generates the full content of a .tab file from {fields, rows} (rows can be arrays or, as returned by
// parseTab with objectRows:true, objects keyed by field name)
export function generateTab(tab: Tab | ObjectTab, options?: Options): string {
    const transformer = getGenerateTransformer(options);
    let result = '';
    function append(err: Error | null, lines?: string | string[] | null): void {
        if(err){ throw err; }
        if(lines != null){
            (Array.isArray(lines) ? lines : [lines]).forEach(function(line){
                result += line + '\r\n';
            });
        }
    }
    transformer(tab.fields, append);
    tab.rows.forEach(function(row){
        transformer(row, append);
    });
    return result;
}
