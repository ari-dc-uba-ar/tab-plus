import expect = require('expect.js');
import fs = require('fs');
import path = require('path');
import os = require('os');
import stream = require('stream');
import parallelTransform = require('parallel-transform');
import {LineSplitter, LineJoiner, LineElement} from 'line-splitter';
import * as tabPlus from '../src/tab-plus';
import {FieldValue} from '../src/tab-plus';
import {runSparse} from '../src/cli';

describe('parseRow', function(){
    const fixtures: [string, FieldValue[]][] = [
        ['splited\\n line\\r\\n|field with pipe \\|', ['splited\n line\r\n', 'field with pipe |']],
        ['multi escaped pipes \\|a\\\\|b\\\\\\|c\\\\\\\\|d', ['multi escaped pipes |a\\', 'b\\|c\\\\', 'd']],
        ['|line with hex \\x7c pipe', ['', 'line with hex | pipe']],
        ['a\\sb', ['a b']],
        ['trailing space   |b', ['trailing space', 'b']],
        ['a\\s|b', ['a ', 'b']],
        ['a\\s   |b', ['a ', 'b']],
        ['a|\\E|b', ['a', '', 'b']],
        ['a|\\N|b', ['a', null, 'b']]
    ];
    fixtures.forEach(function(fixture){
        it('parses '+JSON.stringify(fixture[0]), function(){
            expect(tabPlus.parseRow(fixture[0])).to.eql(fixture[1]);
        });
    });
});

describe('emptyField option', function(){
    it('by default, adjacent separators parse as an empty string', function(){
        expect(tabPlus.parseRow('a||b')).to.eql(['a', '', 'b']);
    });
    it('with emptyField: "null", adjacent separators parse as null', function(){
        expect(tabPlus.parseRow('a||b', {emptyField: 'null'})).to.eql(['a', null, 'b']);
    });
    it('\\E always parses as an empty string, regardless of emptyField', function(){
        expect(tabPlus.parseRow('a|\\E|b', {emptyField: 'null'})).to.eql(['a', '', 'b']);
    });
    it('\\N always parses as null, regardless of emptyField', function(){
        expect(tabPlus.parseRow('a|\\N|b')).to.eql(['a', null, 'b']);
    });
    it('by default, null is generated explicitly as \\N', function(){
        expect(tabPlus.generateRow(['a', null, 'b'])).to.eql('a|\\N|b');
    });
    it('with emptyField: "null", null is generated as an empty (implicit) field', function(){
        expect(tabPlus.generateRow(['a', null, 'b'], {emptyField: 'null'})).to.eql('a||b');
    });
    it('with emptyField: "null", an empty string is generated explicitly as \\E', function(){
        expect(tabPlus.generateRow(['a', '', 'b'], {emptyField: 'null'})).to.eql('a|\\E|b');
    });
    it('round-trips null and empty string through generateRow/parseRow under both modes', function(){
        const row: FieldValue[] = ['', null, 'plain'];
        expect(tabPlus.parseRow(tabPlus.generateRow(row))).to.eql(row);
        expect(tabPlus.parseRow(tabPlus.generateRow(row, {emptyField: 'null'}), {emptyField: 'null'})).to.eql(row);
    });
    it('round-trips a null field through generateTab/parseTab', function(){
        const tab: tabPlus.Tab = {fields: ['id', 'note'], rows: [['1', null], ['2', '']]};
        const text = tabPlus.generateTab(tab, {emptyField: 'null'});
        expect(tabPlus.parseTab(text, {emptyField: 'null'})).to.eql(tab);
    });

    it('treats undefined exactly like null (default mode)', function(){
        expect(tabPlus.generateRow(['a', undefined, 'b'])).to.eql(tabPlus.generateRow(['a', null, 'b']));
    });
    it('treats undefined exactly like null (emptyField: "null")', function(){
        expect(tabPlus.generateRow(['a', undefined, 'b'], {emptyField: 'null'}))
            .to.eql(tabPlus.generateRow(['a', null, 'b'], {emptyField: 'null'}));
    });
    it('treats undefined exactly like null (emptyField: a symbol)', function(){
        const missing = Symbol('missing');
        expect(tabPlus.generateRow(['a', undefined, 'b'], {emptyField: missing}))
            .to.eql(tabPlus.generateRow(['a', null, 'b'], {emptyField: missing}));
    });

    describe('with a symbol', function(){
        const missing = Symbol('missing');

        it('adjacent separators parse as the given symbol', function(){
            expect(tabPlus.parseRow('a||b', {emptyField: missing})).to.eql(['a', missing, 'b']);
        });
        it('\\E and \\N still parse as an explicit empty string and null', function(){
            expect(tabPlus.parseRow('a|\\E|\\N', {emptyField: missing})).to.eql(['a', '', null]);
        });
        it('the given symbol is generated as an empty (implicit) field', function(){
            expect(tabPlus.generateRow(['a', missing, 'b'], {emptyField: missing})).to.eql('a||b');
        });
        it('null and an empty string are generated explicitly, as \\N and \\E', function(){
            expect(tabPlus.generateRow(['a', null, ''], {emptyField: missing})).to.eql('a|\\N|\\E');
        });
        it('throws when given a symbol that does not match options.emptyField', function(){
            const other = Symbol('other');
            expect(function(){ tabPlus.generateRow(['a', other], {emptyField: missing}); }).to.throwError();
        });
        it('round-trips the symbol through generateRow/parseRow', function(){
            const row: FieldValue[] = ['plain', missing, ''];
            expect(tabPlus.parseRow(tabPlus.generateRow(row, {emptyField: missing}), {emptyField: missing})).to.eql(row);
        });
    });
});

describe('escapeField / generateRow', function(){
    it('escapes backslash, pipe, cr, lf and tab', function(){
        expect(tabPlus.escapeField('a\\b|c\rd\ne\tf')).to.eql('a\\\\b\\x7Cc\\rd\\ne\\tf');
    });
    it('leaves plain text untouched', function(){
        expect(tabPlus.escapeField('hello world')).to.eql('hello world');
    });
    it('never generates an escaped pipe (\\|), only its hex code', function(){
        expect(tabPlus.escapeField('|')).to.eql('\\x7C');
        expect(tabPlus.escapeField('|')).not.to.contain('\\|');
    });
    it('escapes other control characters as hex', function(){
        expect(tabPlus.escapeField('a\x00b\x1fc')).to.eql('a\\x00b\\x1Fc');
    });
    it('joins fields with |', function(){
        expect(tabPlus.generateRow(['a', 'b', 'c'])).to.eql('a|b|c');
    });
    it('round-trips through parseRow', function(){
        const row: FieldValue[] = ['plain', 'with|pipe', 'with\\backslash', 'with\r\n\tcontrol', ''];
        expect(tabPlus.parseRow(tabPlus.generateRow(row))).to.eql(row);
    });
});

describe('parseTab', function(){
    it('parses a simple fixture', function(){
        const content = fs.readFileSync(path.join(__dirname, 'fixtures/simple.tab'), 'utf-8');
        const tab = tabPlus.parseTab(content);
        expect(tab.fields).to.eql(['simple_code', 'simple_name']);
        expect(tab.rows).to.eql([['1', 'one'], ['2', 'the second']]);
    });
    it('parses the users fixture and drops the trailing blank line', function(){
        const content = fs.readFileSync(path.join(__dirname, 'fixtures/users.tab'), 'utf-8');
        const tab = tabPlus.parseTab(content);
        expect(tab.fields).to.eql(['username', 'md5pass', 'active_until', 'locked_since', 'rol']);
        expect(tab.rows).to.eql([['bob', '6bdb73cceeff578319840176854246e5', '2099-01-01', '2099-01-01', 'admin']]);
    });
    it('ignores markdown-style separator and blank lines', function(){
        const content = 'a|b\r\n---|---\r\n\r\n1|2\r\n';
        const tab = tabPlus.parseTab(content);
        expect(tab.fields).to.eql(['a', 'b']);
        expect(tab.rows).to.eql([['1', '2']]);
    });
    it('strips a leading UTF8 BOM from the first header field', function(){
        const content = '﻿a|b\r\n1|2\r\n';
        const tab = tabPlus.parseTab(content);
        expect(tab.fields).to.eql(['a', 'b']);
    });
    it('returns empty fields and rows for empty content', function(){
        expect(tabPlus.parseTab('')).to.eql({fields: [], rows: []});
    });
});

describe('objectRows option', function(){
    it('parseTab returns rows as arrays by default', function(){
        const tab = tabPlus.parseTab('a|b\r\n1|2\r\n');
        expect(tab.rows).to.eql([['1', '2']]);
    });
    it('parseTab with objectRows: true returns rows as objects keyed by field name', function(){
        const tab = tabPlus.parseTab('a|b\r\n1|2\r\n3|4\r\n', {objectRows: true});
        expect(tab.fields).to.eql(['a', 'b']);
        expect(tab.rows).to.eql([{a: '1', b: '2'}, {a: '3', b: '4'}]);
    });
    it('generateTab accepts object rows and generates the same output as array rows', function(){
        const fromArrays = tabPlus.generateTab({fields: ['a', 'b'], rows: [['1', '2'], ['3', '4']]});
        const fromObjects = tabPlus.generateTab({fields: ['a', 'b'], rows: [{a: '1', b: '2'}, {a: '3', b: '4'}]});
        expect(fromObjects).to.eql(fromArrays);
    });
    it('round-trips through parseTab(objectRows:true)/generateTab', function(){
        const tab = tabPlus.parseTab('a|b\r\n1|2\r\n3|4\r\n', {objectRows: true});
        expect(tabPlus.parseTab(tabPlus.generateTab(tab), {objectRows: true})).to.eql(tab);
    });
    it('works together with emptyField', function(){
        const tab = tabPlus.parseTab('a|b\r\n1|\r\n', {objectRows: true, emptyField: 'null'});
        expect(tab.rows).to.eql([{a: '1', b: null}]);
    });
});

describe('generateTab', function(){
    it('generates CRLF-separated lines with a trailing line ending, given options.eol', function(){
        const text = tabPlus.generateTab({fields: ['a', 'b'], rows: [['1', '2']]}, {eol: '\r\n'});
        expect(text).to.eql('a|b\r\n1|2\r\n');
    });
    it('round-trips arbitrary data through parseTab', function(){
        const tab: tabPlus.Tab = {
            fields: ['id', 'text'],
            rows: [
                ['1', 'plain text'],
                ['2', 'with|pipe and \\backslash'],
                ['3', 'multi\r\nline\ttabbed'],
                ['4', '']
            ]
        };
        expect(tabPlus.parseTab(tabPlus.generateTab(tab))).to.eql(tab);
    });
    it('never emits an unescaped separator character inside a value', function(){
        const tab: tabPlus.Tab = {fields: ['f'], rows: [['line1\nline2\r\nline3|piped\\backslash']]};
        const text = tabPlus.generateTab(tab, {eol: '\r\n'});
        const lines = text.split(/\r\n/).filter(function(line){ return line !== ''; });
        expect(lines.length).to.eql(2);
        lines.forEach(function(line){
            expect(tabPlus.parseRow(line).length).to.be.greaterThan(0);
        });
        expect(tabPlus.parseTab(text)).to.eql(tab);
    });
    it('generates \\n-separated lines when options.eol is "\\n"', function(){
        const text = tabPlus.generateTab({fields: ['a', 'b'], rows: [['1', '2']]}, {eol: '\n'});
        expect(text).to.eql('a|b\n1|2\n');
    });
    it('defaults to the OS-native line ending, consistently for the whole file, when options.eol is not given', function(){
        const text = tabPlus.generateTab({fields: ['a', 'b'], rows: [['1', '2'], ['3', '4']]});
        expect(text).to.eql(['a|b', '1|2', '3|4', ''].join(os.EOL));
    });
});

describe('getParseTransformer', function(){
    function collectRows<T extends FieldValue[] | tabPlus.RowObject>(transformer: tabPlus.ParseTransformer<T>, lines: string[]): T[] {
        const rows: T[] = [];
        lines.forEach(function(line){
            transformer(line, function(err, row){
                if(err){ throw err; }
                if(row != null){ rows.push(row); }
            });
        });
        return rows;
    }
    it('keeps the first line as fields and also emits it as the first array row', function(){
        const transformer = tabPlus.getParseTransformer();
        const rows = collectRows(transformer, ['a|b']);
        expect(transformer.fields).to.eql(['a', 'b']);
        expect(rows).to.eql([['a', 'b']]);
    });
    it('emits subsequent lines as array rows, header included', function(){
        const transformer = tabPlus.getParseTransformer();
        const rows = collectRows(transformer, ['a|b', '1|2', '3|4']);
        expect(rows).to.eql([['a', 'b'], ['1', '2'], ['3', '4']]);
    });
    it('emits object rows keyed by the stored fields with objectRows: true, header not repeated', function(){
        const transformer = tabPlus.getParseTransformer({objectRows: true});
        const rows = collectRows(transformer, ['a|b', '1|2', '3|4']);
        expect(transformer.fields).to.eql(['a', 'b']);
        expect(rows).to.eql([{a: '1', b: '2'}, {a: '3', b: '4'}]);
    });
    it('emits nothing for comment and blank lines', function(){
        const transformer = tabPlus.getParseTransformer();
        const rows = collectRows(transformer, ['a|b', '---|---', '', '1|2']);
        expect(rows).to.eql([['a', 'b'], ['1', '2']]);
    });
    it('strips a leading UTF8 BOM from the first header field', function(){
        const transformer = tabPlus.getParseTransformer();
        collectRows(transformer, ['﻿a|b']);
        expect(transformer.fields).to.eql(['a', 'b']);
    });
    it('reports parse errors through the callback instead of throwing', function(){
        const transformer = tabPlus.getParseTransformer();
        collectRows(transformer, ['a|b']);
        let captured: Error | null = null;
        transformer('1|\\xzz', function(err){ captured = err; });
        expect(captured).to.be.an(Error);
    });
});

describe('getGenerateTransformer', function(){
    function collectLines(transformer: tabPlus.GenerateTransformer, rows: ((FieldValue | undefined)[] | tabPlus.RowObject)[]): string[] {
        const collected: string[] = [];
        rows.forEach(function(row){
            transformer(row, function(err, lines){
                if(err){ throw err; }
                if(lines != null){
                    (Array.isArray(lines) ? lines : [lines]).forEach(function(line){ collected.push(line); });
                }
            });
        });
        return collected;
    }
    it('a first array row is the header line and defines fields', function(){
        const transformer = tabPlus.getGenerateTransformer();
        const lines = collectLines(transformer, [['a', 'b'], ['1', '2']]);
        expect(transformer.fields).to.eql(['a', 'b']);
        expect(lines).to.eql(['a|b', '1|2']);
    });
    it('a first object row defines fields with its keys and emits header and data lines', function(){
        const transformer = tabPlus.getGenerateTransformer();
        const lines = collectLines(transformer, [{a: '1', b: '2'}, {a: '3', b: '4'}]);
        expect(transformer.fields).to.eql(['a', 'b']);
        expect(lines).to.eql(['a|b', '1|2', '3|4']);
    });
    it('maps subsequent object rows using the stored fields', function(){
        const transformer = tabPlus.getGenerateTransformer();
        const lines = collectLines(transformer, [['a', 'b'], {b: '2', a: '1'}]);
        expect(lines).to.eql(['a|b', '1|2']);
    });
    it('reports generate errors through the callback instead of throwing', function(){
        const transformer = tabPlus.getGenerateTransformer();
        collectLines(transformer, [['a']]);
        let captured: Error | null = null;
        transformer([Symbol('other')], function(err){ captured = err; });
        expect(captured).to.be.an(Error);
    });
});

describe('transformers with parallel-transform', function(){
    it('parses a stream of lines', function(done){
        const transformer = tabPlus.getParseTransformer({objectRows: true});
        const parseStream = parallelTransform(10, transformer);
        const rows: tabPlus.RowObject[] = [];
        parseStream.on('data', function(row: tabPlus.RowObject){ rows.push(row); });
        parseStream.on('error', done);
        parseStream.on('end', function(){
            expect(transformer.fields).to.eql(['a', 'b']);
            expect(rows).to.eql([{a: '1', b: '2'}, {a: '3', b: '4'}]);
            done();
        });
        ['a|b', '---|---', '', '1|2', '3|4'].forEach(function(line){ parseStream.write(line); });
        parseStream.end();
    });
    it('generates a stream of lines that joins into the same text as generateTab', function(done){
        // generateTab defaults to the OS-native eol; match it here instead of pinning either side to a fixed value
        const eol = os.EOL;
        const transformer = tabPlus.getGenerateTransformer();
        const generateStream = parallelTransform(10, transformer);
        let text = '';
        generateStream.on('data', function(lines: string | string[]){
            (Array.isArray(lines) ? lines : [lines]).forEach(function(line){ text += line + eol; });
        });
        generateStream.on('error', done);
        generateStream.on('end', function(){
            expect(text).to.eql(tabPlus.generateTab({fields: ['a', 'b'], rows: [{a: '1', b: '2'}, {a: '3', b: '4'}]}));
            done();
        });
        [{a: '1', b: '2'}, {a: '3', b: '4'}].forEach(function(row){ generateStream.write(row); });
        generateStream.end();
    });
});

// adapts LineSplitter's {line, eol} (Buffer) output into plain strings
function lineElementToString(): stream.Transform {
    return new stream.Transform({
        readableObjectMode: true,
        writableObjectMode: true,
        transform(chunk: LineElement, _encoding, callback){
            callback(null, chunk.line.toString('utf-8'));
        }
    });
}

// adapts plain strings back into LineJoiner's {line, eol} (Buffer) input
function stringToLineElement(): stream.Transform {
    return new stream.Transform({
        readableObjectMode: true,
        writableObjectMode: true,
        transform(line: string, _encoding, callback){
            callback(null, {line: Buffer.from(line, 'utf-8'), eol: Buffer.from('\r\n')} as LineElement);
        }
    });
}

// flattens a single generated line or an array of lines (the header+first-row case in object mode) into
// individual chunks pushed downstream
function flattenLines(): stream.Transform {
    return new stream.Transform({
        readableObjectMode: true,
        writableObjectMode: true,
        transform(this: stream.Transform, lines: string | string[], _encoding, callback){
            (Array.isArray(lines) ? lines : [lines]).forEach(function(line){ this.push(line); }, this);
            callback();
        }
    });
}

function collectText(readable: stream.Readable, done: (text: string) => void): void {
    const chunks: Buffer[] = [];
    const output = new stream.Writable({
        write(chunk: Buffer, _encoding, callback){
            chunks.push(chunk);
            callback();
        }
    });
    readable.pipe(output);
    output.on('finish', function(){ done(Buffer.concat(chunks).toString('utf-8')); });
}

function readableFromLines(lines: string[]): stream.Readable {
    let index = 0;
    return new stream.Readable({
        read(){
            if(index < lines.length){
                this.push(lines[index++] + '\r\n');
            }else{
                this.push(null);
            }
        }
    });
}

describe('full pipeline: LineSplitter -> transform -> LineJoiner', function(){
    it('array mode: the header flows as an ordinary row through the business transform', function(done: (err?: Error) => void){
        const content = 'code|name\r\n1|plain\r\n2|with\\|pipe\r\n';

        // business step: works on plain arrays, oblivious to the tab-plus escaping format; the header is
        // just another row to it, symmetric on both the parse and the generate side
        function uppercaseRow(row: FieldValue[], callback: tabPlus.TransformerCallback<FieldValue[]>): void {
            callback(null, row.map(function(value){
                return typeof value === 'string' ? value.toUpperCase() : value;
            }));
        }

        const output = readableFromLines(content.split(/\r\n/).filter(function(line){ return line !== ''; }))
            .pipe(new LineSplitter({}))
            .pipe(lineElementToString())
            .pipe(parallelTransform(1, tabPlus.getParseTransformer()))
            .pipe(parallelTransform(1, uppercaseRow))
            .pipe(parallelTransform(1, tabPlus.getGenerateTransformer()))
            .pipe(flattenLines())
            .pipe(stringToLineElement())
            .pipe(new LineJoiner({}));

        collectText(output, function(text){
            expect(text).to.eql('CODE|NAME\r\n1|PLAIN\r\n2|WITH\\x7CPIPE\r\n');
            expect(tabPlus.parseTab(text)).to.eql({
                fields: ['CODE', 'NAME'],
                rows: [['1', 'PLAIN'], ['2', 'WITH|PIPE']]
            });
            done();
        });
        output.on('error', done);
    });

    it('object mode: rows carry their field names, no header row needed on either side', function(done: (err?: Error) => void){
        const content = 'code|name\r\n1|plain\r\n2|with\\|pipe\r\n';

        // business step: works on RowObject values only, oblivious to which fields exist or their order;
        // unlike array mode, the header never reaches it (it lives in each object's keys, not its values)
        function uppercaseRow(row: tabPlus.RowObject, callback: tabPlus.TransformerCallback<tabPlus.RowObject>): void {
            const upperRow: tabPlus.RowObject = {};
            Object.keys(row).forEach(function(key){
                const value = row[key];
                upperRow[key] = typeof value === 'string' ? value.toUpperCase() : value;
            });
            callback(null, upperRow);
        }

        const output = readableFromLines(content.split(/\r\n/).filter(function(line){ return line !== ''; }))
            .pipe(new LineSplitter({}))
            .pipe(lineElementToString())
            .pipe(parallelTransform(1, tabPlus.getParseTransformer({objectRows: true})))
            .pipe(parallelTransform(1, uppercaseRow))
            .pipe(parallelTransform(1, tabPlus.getGenerateTransformer()))
            .pipe(flattenLines())
            .pipe(stringToLineElement())
            .pipe(new LineJoiner({}));

        collectText(output, function(text){
            expect(text).to.eql('code|name\r\n1|PLAIN\r\n2|WITH\\x7CPIPE\r\n');
            expect(tabPlus.parseTab(text, {objectRows: true})).to.eql({
                fields: ['code', 'name'],
                rows: [{code: '1', name: 'PLAIN'}, {code: '2', name: 'WITH|PIPE'}]
            });
            done();
        });
        output.on('error', done);
    });
});

describe('cli sparse', function(){
    let dir: string;

    beforeEach(function(){
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-plus-cli-'));
    });

    afterEach(function(){
        fs.rmSync(dir, {recursive: true, force: true});
    });

    function writeInput(name: string, fields: string[], rows: FieldValue[][]): string {
        const file = path.join(dir, name);
        fs.writeFileSync(file, tabPlus.generateTab({fields, rows}), 'utf-8');
        return file;
    }

    function readOutput(name: string): string {
        return fs.readFileSync(path.join(dir, name), 'utf-8');
    }

    // 20 rows: 'mediterraneo' differs from 'false' on 1 row (5%, under the default 10%);
    // 'estrellas' differs from null on 2 rows (10%, not under the default 10%)
    function countryRows(): FieldValue[][] {
        const rows: FieldValue[][] = [];
        for(let i = 0; i < 20; i++){
            rows.push([
                'c' + i,
                i === 9 ? '3' : i === 11 ? '1' : null,
                i === 3 ? 'true' : 'false'
            ]);
        }
        return rows;
    }

    it('moves a column that is mostly "false" into a sparse trailing column, by default', function(){
        writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        runSparse([path.join(dir, 'countries.tab')]);
        const tab = tabPlus.parseTab(readOutput('countries-sparse.tab'));
        expect(tab.fields).to.eql(['c2', 'estrellas', ': mediterraneo:false']);
        expect(tab.rows[3]).to.eql(['c3', null, 'mediterraneo:true']);
        expect(tab.rows[0]).to.eql(['c0', null, '']);
    });

    it('leaves a column at exactly the threshold as a regular column (strictly under, not under-or-equal)', function(){
        writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        runSparse([path.join(dir, 'countries.tab')]);
        const tab = tabPlus.parseTab(readOutput('countries-sparse.tab'));
        expect(tab.fields).to.contain('estrellas');
    });

    it('--under with a lower relative percentage makes an otherwise-regular column sparse too', function(){
        writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        runSparse([path.join(dir, 'countries.tab'), '--under', '15%']);
        const tab = tabPlus.parseTab(readOutput('countries-sparse.tab'));
        expect(tab.fields).to.eql(['c2', ': estrellas mediterraneo:false']);
        expect(tab.rows[9]).to.eql(['c9', 'estrellas:3']);
    });

    it('--under with an absolute count uses a plain row count instead of a percentage', function(){
        writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        runSparse([path.join(dir, 'countries.tab'), '--under', '3']);
        const tab = tabPlus.parseTab(readOutput('countries-sparse.tab'));
        expect(tab.fields).to.eql(['c2', ': estrellas mediterraneo:false']);
    });

    it('--fixed forces a column to stay regular even if it would otherwise qualify', function(){
        writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        runSparse([path.join(dir, 'countries.tab'), '--fixed', 'mediterraneo']);
        const tab = tabPlus.parseTab(readOutput('countries-sparse.tab'));
        expect(tab.fields).to.eql(['c2', 'estrellas', 'mediterraneo']);
    });

    it('--sparse forces a column to become sparse even if it would not otherwise qualify', function(){
        writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        runSparse([path.join(dir, 'countries.tab'), '--sparse', 'c2']);
        const tab = tabPlus.parseTab(readOutput('countries-sparse.tab'));
        expect(tab.fields).to.eql(['estrellas', ': c2 mediterraneo:false']);
        expect(tab.rows[0]).to.eql([null, 'c2:c0']);
    });

    it('escapes a literal space in a sparse value as \\s', function(){
        writeInput('statuses.tab', ['id', 'status'],
            [...Array(10)].map(function(_, i){ return ['id' + i, null] as FieldValue[]; })
                .concat([['id10', 'on hold']]));
        runSparse([path.join(dir, 'statuses.tab'), '--under', '15%']);
        const raw = readOutput('statuses-sparse.tab');
        expect(raw).to.contain('status:on\\shold');
    });

    it('--output picks the output filename instead of the default "-sparse" suffix', function(){
        writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        runSparse([path.join(dir, 'countries.tab'), '--output', path.join(dir, 'custom.tab')]);
        expect(fs.existsSync(path.join(dir, 'custom.tab'))).to.be(true);
        expect(fs.existsSync(path.join(dir, 'countries-sparse.tab'))).to.be(false);
    });

    it('throws when the filename is missing', function(){
        expect(function(){ runSparse([]); }).to.throwError(/missing FILENAME/);
    });

    it('throws when a column is listed in both --fixed and --sparse', function(){
        writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        expect(function(){
            runSparse([path.join(dir, 'countries.tab'), '--fixed', 'c2', '--sparse', 'c2']);
        }).to.throwError(/both --fixed and --sparse/);
    });
});
