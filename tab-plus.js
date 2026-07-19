"use strict";

(function codenautasModuleDefinition(root, name, factory) {
    /* global define */
    /* istanbul ignore next */
    if(typeof root.globalModuleName !== 'string'){
        root.globalModuleName = name;
    }
    /* istanbul ignore next */
    if(typeof exports === 'object' && typeof module === 'object'){
        module.exports = factory();
    }else if(typeof define === 'function' && define.amd){
        define(factory);
    }else if(typeof exports === 'object'){
        exports[root.globalModuleName] = factory();
    }else{
        root[root.globalModuleName] = factory();
    }
    root.globalModuleName = null;
})(/*jshint -W040 */this, 'tabPlus', function() {
/*jshint +W040 */

/*jshint -W004 */
var tabPlus = {};
/*jshint +W004 */

// a field separator '|' is only a separator when not escaped by an odd number of preceding backslashes
var unescapedPipe = /(?<!(?:^|[^\\])(?:\\\\)*\\)\|/;

// a backslash escape: either a single non-'x' char (\t \r \n \s \\ \| ...) or \xHH (1 or 2 hex digits)
var escapeSequence = /\\([^x]|x[\dA-Za-z]{1,2})/g;

var commentOrBlankLine = /^[-| ]*$/;

var charsNeedingEscape = /[\\|\r\n\t\x00-\x1f\x7f]/g;

// whole-field markers: explicit empty string and explicit null, regardless of the `emptyField` option
var explicitEmpty = '\\E';
var explicitNull = '\\N';

function toHex(char){
    return '\\x' + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
}

// options.emptyField: how a field with no content at all (adjacent separators, e.g. `a||b`) is parsed/generated:
// 'string' (default, backwards compatible) means it is an empty string; 'null' means it is `null`.
// Regardless of this option, `\E` always means an explicit empty string and `\N` always means an explicit `null`.
function emptyFieldValue(options){
    return options && options.emptyField === 'null' ? null : '';
}

// turns the raw (still escaped) text of one field into its real value
tabPlus.unescapeField = function unescapeField(rawValue, options){
    var trimmed = rawValue.trimEnd();
    if(trimmed === explicitEmpty){
        return '';
    }
    if(trimmed === explicitNull){
        return null;
    }
    if(trimmed === ''){
        return emptyFieldValue(options);
    }
    return trimmed.replace(escapeSequence, function(_, escaped){
        switch(escaped){
            case 't': return '\t';
            case 'r': return '\r';
            case 'n': return '\n';
            case 's': return ' ';
            default: return escaped.charAt(0) === 'x' ? String.fromCodePoint(parseInt(escaped.slice(1), 16)) : escaped;
        }
    });
};

// turns a field's real value into raw (escaped) text safe to embed between '|' separators
tabPlus.escapeField = function escapeField(value, options){
    if(value === null || value === undefined){
        return emptyFieldValue(options) === null ? '' : explicitNull;
    }
    if(value === '' && emptyFieldValue(options) === null){
        return explicitEmpty;
    }
    return String(value).replace(charsNeedingEscape, function(char){
        switch(char){
            case '\\': return '\\\\';
            case '\r': return '\\r';
            case '\n': return '\\n';
            case '\t': return '\\t';
            default: return toHex(char);
        }
    });
};

// parses one raw line (without CR/LF) into an array of field values
tabPlus.parseRow = function parseRow(rawRow, options){
    return rawRow.split(unescapedPipe).map(function(rawValue){
        return tabPlus.unescapeField(rawValue, options);
    });
};

// generates one raw line (without CR/LF) from an array of field values
tabPlus.generateRow = function generateRow(row, options){
    return row.map(function(value){
        return tabPlus.escapeField(value, options);
    }).join('|');
};

// parses the full content of a .tab file into {fields, rows}
tabPlus.parseTab = function parseTab(text, options){
    var lines = String(text).split(/\r?\n/)
        .filter(function(line){ return !commentOrBlankLine.test(line); })
        .map(function(line){ return tabPlus.parseRow(line, options); })
        .filter(function(row){ return row.length > 1 || (row.length === 1 && (row[0] === null || row[0].trim() !== '')); });
    if(lines.length === 0){
        return {fields: [], rows: []};
    }
    if(typeof lines[0][0] === 'string' && lines[0][0].charCodeAt(0) === 0xfeff){
        lines[0][0] = lines[0][0].slice(1);
    }
    return {fields: lines[0], rows: lines.slice(1)};
};

// generates the full content of a .tab file from {fields, rows}
tabPlus.generateTab = function generateTab(tab, options){
    return [tab.fields].concat(tab.rows).map(function(row){
        return tabPlus.generateRow(row, options);
    }).map(function(line){
        return line + '\r\n';
    }).join('');
};

return tabPlus;

});
