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
            estrellas: {position: 1, sparseDefault: null},
            mediterraneo: {position: 2, sparseDefault: 'false'}
        });
    });
    it('a sparse column without a ":default" suffix defaults to null', function(){
        const tab = tabPlus.parseTab('a|\\: b\r\n1|\r\n');
        expect(tab.columnDefs!.b).to.eql({position: 1, sparseDefault: null});
    });
});

describe('sparse columns: parsing rows', function(){
    it('rows are plain arrays, common columns then sparse columns, defaulting when absent from the block', function(){
        const tab = tabPlus.parseTab(countriesContent);
        expect(tab.rows).to.eql([
            ['AF', 'AFG', '004', 'Afghanistan', 'Afganistán', null, 'false'],
            ['AD', 'AND', '020', 'Andorra', 'Andorra', null, 'true'],
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
    it('round-trips the doc example through parseTab/generateTab', function(){
        const tab = tabPlus.parseTab(countriesContent);
        const text = tabPlus.generateTab(tab, {eol: '\r\n'});
        expect(text).to.eql(countriesContent);
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
        expect(text).to.eql('a|\\: b\r\n1|b:y\r\n2|\r\n');
        expect(tabPlus.parseTab(text)).to.eql({
            fields: ['a', 'b'],
            columnDefs: {a: {position: 1}, b: {position: 1, sparseDefault: null}},
            rows: [['1', 'y'], ['2', null]]
        });
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
