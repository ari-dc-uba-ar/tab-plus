import expect = require('expect.js');
import fs = require('fs');
import os = require('os');
import path = require('path');
import {execFileSync} from 'child_process';
import * as tabPlus from '../src/tab-plus';
import {FieldValue} from '../src/tab-plus';
import {runSparse, main, SparseArgs} from '../src/cli';

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

    function args(overrides: Partial<SparseArgs> & {filename: string}): SparseArgs {
        return {under: undefined, fixed: undefined, sparse: undefined, output: undefined, ...overrides};
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
        const file = writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        runSparse(args({filename: file}));
        const tab = tabPlus.parseTab(readOutput('countries-sparse.tab'));
        expect(tab.fields).to.eql(['c2', 'estrellas', 'mediterraneo']);
        expect(tab.columnDefs).to.eql({
            c2: {position: 1}, estrellas: {position: 2},
            mediterraneo: {position: 1, sparseDefault: 'false'}
        });
        expect(tab.rows[3]).to.eql(['c3', null, 'true']);
        expect(tab.rows[0]).to.eql(['c0', null, 'false']);
    });

    it('leaves a column at exactly the threshold as a regular column (strictly under, not under-or-equal)', function(){
        const file = writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        runSparse(args({filename: file}));
        const tab = tabPlus.parseTab(readOutput('countries-sparse.tab'));
        expect(tab.columnDefs!.estrellas).to.eql({position: 2});
    });

    it('--under with a lower relative percentage makes an otherwise-regular column sparse too', function(){
        const file = writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        runSparse(args({filename: file, under: '15%'}));
        const tab = tabPlus.parseTab(readOutput('countries-sparse.tab'));
        expect(tab.fields).to.eql(['c2', 'estrellas', 'mediterraneo']);
        expect(tab.columnDefs!.estrellas.sparseDefault).to.eql(null);
        expect(tab.rows[9]).to.eql(['c9', '3', 'false']);
    });

    it('--under with an absolute count uses a plain row count instead of a percentage', function(){
        const file = writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        runSparse(args({filename: file, under: '3'}));
        const tab = tabPlus.parseTab(readOutput('countries-sparse.tab'));
        expect(tab.columnDefs!.estrellas.sparseDefault).to.eql(null);
    });

    it('--fixed forces a column to stay regular even if it would otherwise qualify', function(){
        const file = writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        runSparse(args({filename: file, fixed: ['mediterraneo']}));
        const tab = tabPlus.parseTab(readOutput('countries-sparse.tab'));
        expect(tab.columnDefs).to.be(undefined);
        expect(tab.fields).to.eql(['c2', 'estrellas', 'mediterraneo']);
    });

    it('--fixed leaves the other (unlisted) columns as they were in the original, not auto-computed', function(){
        // 'estrellas' would qualify under --under 15%, but --fixed is in effect, so only 'mediterraneo' is
        // touched (forced regular) and 'estrellas' keeps its original (regular) status instead of becoming sparse
        const file = writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        runSparse(args({filename: file, under: '15%', fixed: ['mediterraneo']}));
        const tab = tabPlus.parseTab(readOutput('countries-sparse.tab'));
        expect(tab.columnDefs).to.be(undefined);
    });

    it('--sparse forces a column to become sparse even if it would not otherwise qualify', function(){
        const file = writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        runSparse(args({filename: file, sparse: ['c2']}));
        const tab = tabPlus.parseTab(readOutput('countries-sparse.tab'));
        expect(tab.fields).to.eql(['estrellas', 'mediterraneo', 'c2']);
        expect(tab.rows[0]).to.eql([null, 'false', 'c0']);
    });

    it('--sparse leaves the other (unlisted) columns as they were in the original', function(){
        // re-run on an already-sparse file: 'mediterraneo' was already sparse in the input, forcing 'c2' to
        // become sparse too must not touch 'mediterraneo', nor recompute it against --under
        const sparseInput = 'c2|estrellas|\\: mediterraneo:false\r\nc0|\\N|\r\nc3|\\N|mediterraneo:true\r\n';
        const file = path.join(dir, 'already-sparse.tab');
        fs.writeFileSync(file, sparseInput, 'utf-8');
        runSparse(args({filename: file, sparse: ['c2']}));
        const tab = tabPlus.parseTab(readOutput('already-sparse-sparse.tab'));
        expect(tab.columnDefs!.mediterraneo.sparseDefault).to.eql('false');
        expect(tab.columnDefs!.c2.sparseDefault).to.eql(null);
    });

    it('escapes a literal space in a sparse value as \\s', function(){
        const rows: FieldValue[][] = [];
        for(let i = 0; i < 10; i++){ rows.push(['id' + i, null]); }
        rows.push(['id10', 'on hold']);
        const file = writeInput('statuses.tab', ['id', 'status'], rows);
        runSparse(args({filename: file}));
        const raw = readOutput('statuses-sparse.tab');
        expect(raw).to.contain('status:on\\shold');
    });

    it('--output picks the output filename instead of the default "-sparse" suffix', function(){
        const file = writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        runSparse(args({filename: file, output: path.join(dir, 'custom.tab')}));
        expect(fs.existsSync(path.join(dir, 'custom.tab'))).to.be(true);
        expect(fs.existsSync(path.join(dir, 'countries-sparse.tab'))).to.be(false);
    });

    it('throws when a column is listed in both --fixed and --sparse', function(){
        const file = writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        expect(function(){
            runSparse(args({filename: file, fixed: ['c2'], sparse: ['c2']}));
        }).to.throwError(/both --fixed and --sparse/);
    });

    it('main() wires argv parsing through to runSparse', function(){
        const file = writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        main(['sparse', file, '--under', '15%']);
        const tab = tabPlus.parseTab(readOutput('countries-sparse.tab'));
        expect(tab.fields).to.eql(['c2', 'estrellas', 'mediterraneo']);
    });

    it('main() reports an unknown --fixed/--sparse overlap through stderr and a non-zero exit code, as a subprocess', function(){
        const file = writeInput('countries.tab', ['c2', 'estrellas', 'mediterraneo'], countryRows());
        expect(function(){
            execFileSync('node', [
                path.join(__dirname, '../bin/tab-plus.js'), 'sparse', file, '--fixed', 'c2', '--sparse', 'c2'
            ], {encoding: 'utf-8', stdio: 'pipe'});
        }).to.throwError(function(err: any){
            expect(err.status).to.eql(1);
            expect(err.stderr).to.contain('both --fixed and --sparse');
        });
    });

    it('a missing FILENAME is rejected by the CLI parser with a non-zero exit code, as a subprocess', function(){
        expect(function(){
            execFileSync('node', [path.join(__dirname, '../bin/tab-plus.js'), 'sparse'], {encoding: 'utf-8', stdio: 'pipe'});
        }).to.throwError(function(err: any){
            expect(err.status).to.eql(1);
        });
    });
});
