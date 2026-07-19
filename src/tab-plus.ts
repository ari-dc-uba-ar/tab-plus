export type FieldValue = string | null;

export interface Options {
    emptyField?: 'string' | 'null';
}

export interface Tab {
    fields: FieldValue[];
    rows: FieldValue[][];
}

// a field separator '|' is only a separator when not escaped by an odd number of preceding backslashes
const unescapedPipe = /(?<!(?:^|[^\\])(?:\\\\)*\\)\|/;

// a backslash escape: either a single non-'x' char (\t \r \n \s \\ \| ...) or \xHH (1 or 2 hex digits)
const escapeSequence = /\\([^x]|x[\dA-Za-z]{1,2})/g;

const commentOrBlankLine = /^[-| ]*$/;

const charsNeedingEscape = /[\\|\r\n\t\x00-\x1f\x7f]/g;

// whole-field markers: explicit empty string and explicit null, regardless of the `emptyField` option
const explicitEmpty = '\\E';
const explicitNull = '\\N';

function toHex(char: string): string {
    return '\\x' + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
}

// options.emptyField: how a field with no content at all (adjacent separators, e.g. `a||b`) is parsed/generated:
// 'string' (default, backwards compatible) means it is an empty string; 'null' means it is `null`.
// Regardless of this option, `\E` always means an explicit empty string and `\N` always means an explicit `null`.
function emptyFieldValue(options?: Options): FieldValue {
    return options && options.emptyField === 'null' ? null : '';
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
    if(value === null || value === undefined){
        return emptyFieldValue(options) === null ? '' : explicitNull;
    }
    if(value === '' && emptyFieldValue(options) === null){
        return explicitEmpty;
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

// parses the full content of a .tab file into {fields, rows}
export function parseTab(text: string, options?: Options): Tab {
    const lines = String(text).split(/\r?\n/)
        .filter(function(line){ return !commentOrBlankLine.test(line); })
        .map(function(line){ return parseRow(line, options); })
        .filter(function(row){ return row.length > 1 || (row.length === 1 && (row[0] === null || row[0].trim() !== '')); });
    if(lines.length === 0){
        return {fields: [], rows: []};
    }
    const firstField = lines[0][0];
    if(typeof firstField === 'string' && firstField.charCodeAt(0) === 0xfeff){
        lines[0][0] = firstField.slice(1);
    }
    return {fields: lines[0], rows: lines.slice(1)};
}

// generates the full content of a .tab file from {fields, rows}
export function generateTab(tab: Tab, options?: Options): string {
    return [tab.fields].concat(tab.rows).map(function(row){
        return generateRow(row, options);
    }).map(function(line){
        return line + '\r\n';
    }).join('');
}
