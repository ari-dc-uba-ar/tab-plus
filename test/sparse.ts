import expect = require('expect.js');
import * as tabPlus from '../src/tab-plus';
import {FieldValue} from '../src/tab-plus';

const countriesHeader = 'c2|c3|num|en_name|sp_name|\\: estrellas mediterraneo:false';
const countriesContent = countriesHeader + '\r\n' +
    'AF|AFG|004|Afghanistan|Afganistán|\r\n' +
    'AD|AND|020|Andorra|Andorra|mediterraneo:true\r\n' +
    'AR|ARG|032|Argentina|Argentina|estrellas:3\r\n';

describe('sparse columns: header parsing', function(){
    it('without a \\: marker, parseTab omits columnDefs entirely (backwards compatible)', function(){
        const tab = tabPlus.parseTab('a|b\r\n1|2\r\n');
        expect(tab.fields).to.eql(['a', 'b']);
        expect(tab.columnDefs).to.be(undefined);
    });
    it('parses the doc example header into fields and columnDefs', function(){
        const tab = tabPlus.parseTab(countriesContent);
        expect(tab.fields).to.eql(['c2', 'c3', 'num', 'en_name', 'sp_name', 'estrellas', 'mediterraneo']);
        expect(tab.columnDefs).to.eql({
            c2: {position: 1}, c3: {position: 2}, num: {position: 3}, en_name: {position: 4}, sp_name: {position: 5},
            estrellas: {position: 1, sparseDefault: ''},
            mediterraneo: {position: 2, sparseDefault: 'false'}
        });
    });
    // a sparse column's ':default' suffix has the exact same three-way ambiguity as any regular field
    // (compare to the 'emptyField option' describe block above): ':\E' forces '', ':\N' forces null, and no
    // suffix at all means "whatever an implicitly-empty field means", i.e. emptyFieldValue(options)
    it('"column:\\E" declares an explicit empty-string default', function(){
        const tab = tabPlus.parseTab('a|\\: b:\\E\r\n1|\r\n');
        expect(tab.columnDefs!.b).to.eql({position: 1, sparseDefault: ''});
    });
    it('"column:\\N" declares an explicit null default', function(){
        const tab = tabPlus.parseTab('a|\\: b:\\N\r\n1|\r\n');
        expect(tab.columnDefs!.b).to.eql({position: 1, sparseDefault: null});
    });
    it('a bare "column" (no suffix at all) defaults like an implicitly-empty field: \'\' by default', function(){
        const tab = tabPlus.parseTab('a|\\: b\r\n1|\r\n');
        expect(tab.columnDefs!.b).to.eql({position: 1, sparseDefault: ''});
    });
    it('a bare "column" defaults to null with emptyField: "null"', function(){
        const tab = tabPlus.parseTab('a|\\: b\r\n1|\r\n', {emptyField: 'null'});
        expect(tab.columnDefs!.b).to.eql({position: 1, sparseDefault: null});
    });
    it('a bare "column" defaults to the configured symbol with emptyField: a symbol', function(){
        const missing = Symbol('missing');
        const tab = tabPlus.parseTab('a|\\: b\r\n1|\r\n', {emptyField: missing});
        expect(tab.columnDefs!.b).to.eql({position: 1, sparseDefault: missing});
    });
});

describe('sparse columns: parsing rows', function(){
    it('rows are plain arrays, common columns then sparse columns, defaulting when absent from the block', function(){
        const tab = tabPlus.parseTab(countriesContent);
        expect(tab.rows).to.eql([
            ['AF', 'AFG', '004', 'Afghanistan', 'Afganistán', '', 'false'],
            ['AD', 'AND', '020', 'Andorra', 'Andorra', '', 'true'],
            ['AR', 'ARG', '032', 'Argentina', 'Argentina', '3', 'false']
        ]);
    });
    it('supports several sparse values on the same row, in any order', function(){
        const tab = tabPlus.parseTab(countriesHeader + '\r\nAA|AAA|000|X|Y|mediterraneo:true estrellas:1\r\n');
        expect(tab.rows).to.eql([['AA', 'AAA', '000', 'X', 'Y', '1', 'true']]);
    });
    it('escapes work the same inside sparse values as in any field (\\s, \\xHH, \\E, \\N)', function(){
        const tab = tabPlus.parseTab('a|\\: b\r\n1|b:x\\sy\r\n2|b:\\E\r\n3|b:\\N\r\n');
        expect(tab.rows).to.eql([['1', 'x y'], ['2', ''], ['3', null]]);
    });
    it('throws in strict mode (default) on a sparse column without a ":"', function(){
        expect(function(){
            tabPlus.parseTab(countriesHeader + '\r\nAA|AAA|000|X|Y|mediterraneo\r\n');
        }).to.throwError();
    });
    it('throws in strict mode (default) on a sparse column repeated in the same row', function(){
        expect(function(){
            tabPlus.parseTab(countriesHeader + '\r\nAA|AAA|000|X|Y|estrellas:1 estrellas:2\r\n');
        }).to.throwError();
    });
    it('throws in strict mode (default) on a sparse column not declared in the header', function(){
        expect(function(){
            tabPlus.parseTab(countriesHeader + '\r\nAA|AAA|000|X|Y|notdeclared:1\r\n');
        }).to.throwError();
    });
    it('throws when a data row is missing the trailing sparse-columns field entirely', function(){
        expect(function(){
            tabPlus.parseTab(countriesHeader + '\r\nAA|AAA|000|X|Y\r\n');
        }).to.throwError();
    });
});

describe('sparse columns: permissive mode (options.strict: false)', function(){
    it('a missing ":" uses options.defaultValue', function(){
        const tab = tabPlus.parseTab(
            countriesHeader + '\r\nAA|AAA|000|X|Y|mediterraneo\r\n',
            {strict: false, defaultValue: 'oops', repeatedColumn: 'last', unknownColumn: '\\:unknown'}
        );
        expect(tab.rows[0][6]).to.eql('oops');
    });
    it('repeatedColumn: "last" keeps the last occurrence', function(){
        const tab = tabPlus.parseTab(
            countriesHeader + '\r\nAA|AAA|000|X|Y|estrellas:1 estrellas:2\r\n',
            {strict: false, defaultValue: null, repeatedColumn: 'last', unknownColumn: '\\:unknown'}
        );
        expect(tab.rows[0][5]).to.eql('2');
    });
    it('repeatedColumn: "first" keeps the first occurrence', function(){
        const tab = tabPlus.parseTab(
            countriesHeader + '\r\nAA|AAA|000|X|Y|estrellas:1 estrellas:2\r\n',
            {strict: false, defaultValue: null, repeatedColumn: 'first', unknownColumn: '\\:unknown'}
        );
        expect(tab.rows[0][5]).to.eql('1');
    });
    it('an undeclared column lands, as raw "name:value" text, in options.unknownColumn', function(){
        const tab = tabPlus.parseTab(
            countriesHeader + '\r\nAA|AAA|000|X|Y|notdeclared:1 alsonot:2\r\n',
            tabPlus.permissiveOptions
        );
        const unknownIndex = tab.fields.indexOf(tabPlus.permissiveOptions.unknownColumn);
        expect(tab.rows[0][unknownIndex]).to.eql('notdeclared:1 alsonot:2');
    });
    it('options.unknownColumn defaults to null when there is nothing undeclared on that row', function(){
        const tab = tabPlus.parseTab(
            countriesHeader + '\r\nAA|AAA|000|X|Y|estrellas:1\r\n',
            tabPlus.permissiveOptions
        );
        const unknownIndex = tab.fields.indexOf(tabPlus.permissiveOptions.unknownColumn);
        expect(tab.rows[0][unknownIndex]).to.eql(null);
    });
    it('tabPlus.permissiveOptions can be spread directly into options', function(){
        expect(function(){
            tabPlus.parseTab(countriesHeader + '\r\nAA|AAA|000|X|Y|mediterraneo notdeclared:1\r\n', {...tabPlus.permissiveOptions});
        }).not.to.throwError();
    });
});

describe('sparse columns: generating', function(){
    it('round-trips the doc example through parseTab/generateTab, writing the bare default explicitly', function(){
        const tab = tabPlus.parseTab(countriesContent);
        const text = tabPlus.generateTab(tab, {eol: '\r\n'});
        expect(text).to.eql(countriesContent.replace('\\: estrellas ', '\\: estrellas:\\E '));
        expect(tabPlus.generateTab(tabPlus.parseTab(text), {eol: '\r\n'})).to.eql(text);
    });
    it('generates the header\'s \\: marker with declared defaults', function(){
        const tab: tabPlus.Tab = {
            fields: ['a', 'b'],
            columnDefs: {a: {position: 1}, b: {position: 1, sparseDefault: 'x'}},
            rows: [['1', 'x'], ['2', 'y']]
        };
        const text = tabPlus.generateTab(tab, {eol: '\r\n'});
        expect(text).to.eql('a|\\: b:x\r\n1|\r\n2|b:y\r\n');
    });
    it('omits a sparse column from a row when its value equals sparseDefault', function(){
        const tab: tabPlus.Tab = {
            fields: ['a', 'b'],
            columnDefs: {a: {position: 1}, b: {position: 1, sparseDefault: 'x'}},
            rows: [['1', 'x']]
        };
        expect(tabPlus.generateTab(tab, {eol: '\r\n'})).to.eql('a|\\: b:x\r\n1|\r\n');
    });
    it('a column present in fields but missing from columnDefs is generated as sparse with a null default', function(){
        const tab: tabPlus.Tab = {
            fields: ['a', 'b'],
            columnDefs: {a: {position: 1}},
            rows: [['1', 'y'], ['2', null]]
        };
        const text = tabPlus.generateTab(tab, {eol: '\r\n'});
        expect(text).to.eql('a|\\: b:\\N\r\n1|b:y\r\n2|\r\n');
        expect(tabPlus.parseTab(text)).to.eql({
            fields: ['a', 'b'],
            columnDefs: {a: {position: 1}, b: {position: 1, sparseDefault: null}},
            rows: [['1', 'y'], ['2', null]]
        });
    });
    it('a null sparseDefault is written with an explicit ":\\N" suffix (it is not what an implicitly-empty field means, by default)', function(){
        const tab: tabPlus.Tab = {
            fields: ['id', 'status'],
            columnDefs: {id: {position: 1}, status: {position: 1, sparseDefault: null}},
            rows: [['1', 'on hold'], ['2', null]]
        };
        const text = tabPlus.generateTab(tab, {eol: '\r\n'});
        expect(text).to.eql('id|\\: status:\\N\r\n1|status:on\\shold\r\n2|\r\n');
        expect(tabPlus.parseTab(text)).to.eql(tab);
    });
    it('an empty-string sparseDefault is written with an explicit ":\\E" suffix, even when it is what an implicitly-empty field means', function(){
        const tab: tabPlus.Tab = {
            fields: ['id', 'status'],
            columnDefs: {id: {position: 1}, status: {position: 1, sparseDefault: ''}},
            rows: [['1', 'on hold'], ['2', '']]
        };
        const text = tabPlus.generateTab(tab, {eol: '\r\n'});
        expect(text).to.eql('id|\\: status:\\E\r\n1|status:on\\shold\r\n2|\r\n');
        expect(tabPlus.parseTab(text)).to.eql(tab);
    });
    it('escapes a literal space in a sparse column\'s declared default, and round-trips it back through parseTab', function(){
        const tab: tabPlus.Tab = {
            fields: ['id', 'status'],
            columnDefs: {id: {position: 1}, status: {position: 1, sparseDefault: 'not applicable'}},
            rows: [['1', 'not applicable'], ['2', 'on hold']]
        };
        const text = tabPlus.generateTab(tab, {eol: '\r\n'});
        expect(text).to.eql('id|\\: status:not\\sapplicable\r\n1|\r\n2|status:on\\shold\r\n');
        expect(tabPlus.parseTab(text)).to.eql(tab);
    });
});

describe('sparse columns: parseRow/generateRow with an explicit columnDefs', function(){
    const columnDefs: tabPlus.ColumnDefs = {
        a: {position: 1},
        b: {position: 1, sparseDefault: 'x'}
    };
    it('parseRow returns one plain value per column, common then sparse', function(){
        expect(tabPlus.parseRow('1|', undefined, columnDefs)).to.eql(['1', 'x']);
        expect(tabPlus.parseRow('1|b:y', undefined, columnDefs)).to.eql(['1', 'y']);
    });
    it('generateRow is the inverse of parseRow', function(){
        expect(tabPlus.generateRow(['1', 'x'], undefined, columnDefs)).to.eql('1|');
        expect(tabPlus.generateRow(['1', 'y'], undefined, columnDefs)).to.eql('1|b:y');
    });
    it('without columnDefs, parseRow/generateRow are unchanged (backwards compatible)', function(){
        const row: FieldValue[] = ['1', '2', '3'];
        expect(tabPlus.parseRow(tabPlus.generateRow(row))).to.eql(row);
    });
    it('with columnDefs declaring no sparse columns, behaves like the no-columnDefs case', function(){
        const plain: tabPlus.ColumnDefs = {a: {position: 1}, b: {position: 2}};
        expect(tabPlus.parseRow('1|2', undefined, plain)).to.eql(['1', '2']);
        expect(tabPlus.generateRow(['1', '2'], undefined, plain)).to.eql('1|2');
    });
});

describe('emptyField "both"', function(){
    it('generates both null and \'\' as a field with no content at all', function(){
        expect(tabPlus.generateRow(['a', null, '', undefined, 'b'], {emptyField: 'both'})).to.eql('a||||b');
    });
    it('cannot be used for parsing', function(){
        expect(function(){ tabPlus.parseRow('a||b', {emptyField: 'both'}); }).to.throwError(/only be used for generating/);
        expect(function(){ tabPlus.parseTab('a|b\r\n1|2\r\n', {emptyField: 'both'}); }).to.throwError(/only be used for generating/);
        expect(function(){ tabPlus.unescapeField('x', {emptyField: 'both'}); }).to.throwError(/only be used for generating/);
        expect(function(){ tabPlus.emptyFieldValue({emptyField: 'both'}); }).to.throwError(/only be used for generating/);
    });
    it('still writes a sparse default explicitly in the header, and a differing \'\' or null as an empty pair', function(){
        const tab: tabPlus.Tab = {
            fields: ['id', 'a', 'b'],
            columnDefs: {id: {position: 1}, a: {position: 1, sparseDefault: null}, b: {position: 2, sparseDefault: ''}},
            rows: [['1', '', null], ['2', null, '']]
        };
        expect(tabPlus.generateTab(tab, {eol: '\r\n', emptyField: 'both'})).to.eql('id|\\: a:\\N b:\\E\r\n1|a: b:\r\n2|\r\n');
    });
});

describe('emptyField per column', function(){
    const perColumn: tabPlus.Options['columnDefs'] = {a: {emptyField: 'null'}, b: {emptyField: 'string'}};
    const plainText = 'id|a|b\r\n1||\r\n2|\\E|\\N\r\n';
    const plainRows: FieldValue[][] = [['1', null, ''], ['2', '', null]];

    it('options.columnDefs sets the emptyField of each column when generating a plain .tab', function(){
        expect(tabPlus.generateTab({fields: ['id', 'a', 'b'], rows: plainRows}, {eol: '\r\n', columnDefs: perColumn})).to.eql(plainText);
    });
    it('options.columnDefs sets the emptyField of each column when parsing a plain .tab', function(){
        expect(tabPlus.parseTab(plainText, {columnDefs: perColumn}).rows).to.eql(plainRows);
    });
    it('a ColumnDef\'s own emptyField works the same as options.columnDefs', function(){
        const tab: tabPlus.Tab = {
            fields: ['id', 'a', 'b'],
            columnDefs: {id: {position: 1}, a: {position: 2, emptyField: 'null'}, b: {position: 3, emptyField: 'string'}},
            rows: plainRows
        };
        expect(tabPlus.generateTab(tab, {eol: '\r\n'})).to.eql(plainText);
    });
    it('overrides options.emptyField only for the columns it names', function(){
        expect(tabPlus.generateTab({fields: ['a', 'c'], rows: [[null, null]]}, {eol: '\r\n', emptyField: 'string', columnDefs: perColumn}))
            .to.eql('a|c\r\n|\\N\r\n');
    });
    it('throws when a ColumnDef\'s emptyField differs from options.columnDefs', function(){
        const tab: tabPlus.Tab = {fields: ['a'], columnDefs: {a: {position: 1, emptyField: 'string'}}, rows: []};
        expect(function(){ tabPlus.generateTab(tab, {columnDefs: perColumn}); }).to.throwError(/differs from options.columnDefs/);
    });
    it('parseRow/generateRow apply options.columnDefs to the given columnDefs', function(){
        const columnDefs: tabPlus.ColumnDefs = {a: {position: 1}, b: {position: 2}};
        expect(tabPlus.parseRow('|', {columnDefs: perColumn}, columnDefs)).to.eql([null, '']);
        expect(tabPlus.generateRow([null, ''], {columnDefs: perColumn}, columnDefs)).to.eql('|');
    });
    it('parseRow/generateRow throw when given options.columnDefs without a columnDefs to name the columns', function(){
        expect(function(){ tabPlus.parseRow('|', {columnDefs: perColumn}); }).to.throwError(/needs a columnDefs/);
        expect(function(){ tabPlus.generateRow([null, ''], {columnDefs: perColumn}); }).to.throwError(/needs a columnDefs/);
    });
    it('a bare sparse default in the header is read with the column\'s emptyField', function(){
        const tab = tabPlus.parseTab('id|\\: a b\r\n1|\r\n', {columnDefs: perColumn});
        expect(tab.columnDefs).to.eql({
            id: {position: 1},
            a: {position: 1, sparseDefault: null, emptyField: 'null'},
            b: {position: 2, sparseDefault: '', emptyField: 'string'}
        });
    });
    it('the values in the sparse block are written and read with the column\'s emptyField', function(){
        const tab: tabPlus.Tab = {
            fields: ['id', 'a', 'b'],
            columnDefs: {id: {position: 1}, a: {position: 1, sparseDefault: 'x'}, b: {position: 2, sparseDefault: 'x'}},
            rows: [['1', null, ''], ['2', '', null]]
        };
        const text = tabPlus.generateTab(tab, {eol: '\r\n', columnDefs: perColumn});
        expect(text).to.eql('id|\\: a:x b:x\r\n1|a: b:\r\n2|a:\\E b:\\N\r\n');
        expect(tabPlus.parseTab(text, {columnDefs: perColumn}).rows).to.eql(tab.rows);
    });
    it('keeps \'\' and null apart in the sparse block with a global emptyField "null"', function(){
        const tab: tabPlus.Tab = {
            fields: ['a', 'b'],
            columnDefs: {a: {position: 1}, b: {position: 1, sparseDefault: 'x'}},
            rows: [['1', ''], ['2', null]]
        };
        const text = tabPlus.generateTab(tab, {eol: '\r\n', emptyField: 'null'});
        expect(text).to.eql('a|\\: b:x\r\n1|b:\\E\r\n2|b:\r\n');
        expect(tabPlus.parseTab(text, {emptyField: 'null'}).rows).to.eql(tab.rows);
    });
    it('a symbol sparse default that is the column\'s emptyField is left bare in the header', function(){
        const missing = Symbol('missing');
        const tab: tabPlus.Tab = {
            fields: ['id', 'a'],
            columnDefs: {id: {position: 1}, a: {position: 1, sparseDefault: missing, emptyField: missing}},
            rows: [['1', missing], ['2', 'y']]
        };
        const text = tabPlus.generateTab(tab, {eol: '\r\n'});
        expect(text).to.eql('id|\\: a\r\n1|\r\n2|a:y\r\n');
        expect(tabPlus.parseTab(text, {columnDefs: {a: {emptyField: missing}}}).rows).to.eql(tab.rows);
    });
});
