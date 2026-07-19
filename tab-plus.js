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

function toHex(char){
    return '\\x' + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
}

// turns the raw (still escaped) text of one field into its real value
tabPlus.unescapeField = function unescapeField(rawValue){
    return rawValue.trimEnd().replace(escapeSequence, function(_, escaped){
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
tabPlus.escapeField = function escapeField(value){
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
tabPlus.parseRow = function parseRow(rawRow){
    return rawRow.split(unescapedPipe).map(tabPlus.unescapeField);
};

// generates one raw line (without CR/LF) from an array of field values
tabPlus.generateRow = function generateRow(row){
    return row.map(tabPlus.escapeField).join('|');
};

// parses the full content of a .tab file into {fields, rows}
tabPlus.parseTab = function parseTab(text){
    var lines = String(text).split(/\r?\n/)
        .filter(function(line){ return !commentOrBlankLine.test(line); })
        .map(tabPlus.parseRow)
        .filter(function(row){ return row.length > 1 || (row.length === 1 && row[0].trim() !== ''); });
    if(lines.length === 0){
        return {fields: [], rows: []};
    }
    if(lines[0][0].charCodeAt(0) === 0xfeff){
        lines[0][0] = lines[0][0].slice(1);
    }
    return {fields: lines[0], rows: lines.slice(1)};
};

// generates the full content of a .tab file from {fields, rows}
tabPlus.generateTab = function generateTab(tab){
    return [tab.fields].concat(tab.rows).map(tabPlus.generateRow).map(function(line){
        return line + '\r\n';
    }).join('');
};

return tabPlus;

});
