import expect = require('expect.js');
import {FieldValue} from '../src/tab-plus';
import {parseThreshold, decideSparseColumns, defaultThreshold} from '../src/auto-tab-plus';

describe('auto-tab-plus: parseThreshold', function(){
    it('parses "10%" as a relative threshold of 0.10', function(){
        expect(parseThreshold('10%')).to.eql({kind: 'relative', value: 0.10});
    });
    it('parses "10" (no "%") as an absolute threshold', function(){
        expect(parseThreshold('10')).to.eql({kind: 'absolute', value: 10});
    });
    it('throws on a non-numeric value', function(){
        expect(function(){ parseThreshold('abc'); }).to.throwError();
        expect(function(){ parseThreshold('abc%'); }).to.throwError();
    });
});

describe('auto-tab-plus: decideSparseColumns candidate defaults', function(){
    // a column mostly '0', with a handful of '1's: null/false alone (the old heuristic) would never notice
    // this - every row differs from both null and 'false' - but '0' is a very common way to encode "off"
    function flagRows(oddIndexes: number[]): FieldValue[][] {
        const rows: FieldValue[][] = [];
        for(let i = 0; i < 20; i++){
            rows.push(['r' + i, oddIndexes.indexOf(i) !== -1 ? '1' : '0']);
        }
        return rows;
    }

    it('picks the literal "0" as the default for a mostly-"0"/"1" column', function(){
        const fields: FieldValue[] = ['id', 'flag'];
        const rows = flagRows([7]); // 1/20 = 5%, under the default 10%
        const decided = decideSparseColumns(fields, rows, undefined, {under: defaultThreshold});
        expect(decided.columnDefs.flag).to.eql({position: 1, sparseDefault: '0'});
        expect(decided.fields).to.eql(['id', 'flag']);
    });
    it('picks the literal "1" as the default for a mostly-"1"/"0" column', function(){
        const fields: FieldValue[] = ['id', 'flag'];
        const rows: FieldValue[][] = [];
        for(let i = 0; i < 20; i++){ rows.push(['r' + i, i === 7 ? '0' : '1']); }
        const decided = decideSparseColumns(fields, rows, undefined, {under: defaultThreshold});
        expect(decided.columnDefs.flag).to.eql({position: 1, sparseDefault: '1'});
    });
    it('picks "true" or "false" as the default for a mostly-boolean-word column', function(){
        const fields: FieldValue[] = ['id', 'flag'];
        const rows: FieldValue[][] = [];
        for(let i = 0; i < 20; i++){ rows.push(['r' + i, i === 7 ? 'true' : 'false']); }
        const decided = decideSparseColumns(fields, rows, undefined, {under: defaultThreshold});
        expect(decided.columnDefs.flag).to.eql({position: 1, sparseDefault: 'false'});
    });
    it('picks null over "0"/"1"/"true"/"false" when null leaves fewer rows differing', function(){
        const fields: FieldValue[] = ['id', 'note'];
        const rows: FieldValue[][] = [];
        for(let i = 0; i < 20; i++){ rows.push(['r' + i, i === 7 ? 'special' : null]); }
        const decided = decideSparseColumns(fields, rows, undefined, {under: defaultThreshold});
        expect(decided.columnDefs.note).to.eql({position: 1, sparseDefault: null});
    });
    it('--sparse forces the best-of-7 default even when nothing qualifies under --under', function(){
        const fields: FieldValue[] = ['id', 'flag'];
        const rows: FieldValue[][] = [];
        for(let i = 0; i < 20; i++){ rows.push(['r' + i, i < 15 ? '0' : '1']); } // 25% differ, over the 10% default
        const decided = decideSparseColumns(fields, rows, undefined, {under: defaultThreshold, sparse: ['flag']});
        expect(decided.columnDefs.flag).to.eql({position: 1, sparseDefault: '0'});
    });
});
