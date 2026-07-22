import * as fs from 'fs';
import * as path from 'path';
import {FieldValue, Options, parseTab, escapeField} from './tab-plus';

interface Threshold {
    kind: 'relative' | 'absolute';
    value: number;
}

const defaultThreshold: Threshold = {kind: 'relative', value: 0.10};

function parseThreshold(raw: string): Threshold {
    if(raw.charAt(raw.length - 1) === '%'){
        const percent = Number(raw.slice(0, -1));
        if(!isFinite(percent)){
            throw new Error('tab-plus sparse: invalid --under value: ' + raw);
        }
        return {kind: 'relative', value: percent / 100};
    }
    const count = Number(raw);
    if(!isFinite(count)){
        throw new Error('tab-plus sparse: invalid --under value: ' + raw);
    }
    return {kind: 'absolute', value: count};
}

// a column qualifies (is worth making sparse against a given default) when the amount of rows that differ
// from that default is under the threshold: a fraction of the total rows (relative) or a plain row count (absolute)
function qualifies(diffCount: number, total: number, threshold: Threshold): boolean {
    if(threshold.kind === 'relative'){
        if(total === 0){
            return true;
        }
        return diffCount / total < threshold.value;
    }
    return diffCount < threshold.value;
}

interface SparseArgs {
    filename: string;
    under: Threshold;
    fixed: string[] | null;
    sparse: string[] | null;
    output: string | null;
}

function parseSparseArgs(argv: string[]): SparseArgs {
    let filename: string | null = null;
    let under: Threshold = defaultThreshold;
    let fixed: string[] | null = null;
    let sparse: string[] | null = null;
    let output: string | null = null;
    let i = 0;
    while(i < argv.length){
        const arg = argv[i];
        if(arg === '--under'){
            if(argv[i + 1] === undefined){
                throw new Error('tab-plus sparse: --under needs a value');
            }
            under = parseThreshold(argv[i + 1]);
            i += 2;
        }else if(arg === '--fixed' || arg === '--sparse'){
            const columns: string[] = [];
            i++;
            while(i < argv.length && argv[i].slice(0, 2) !== '--'){
                columns.push(argv[i]);
                i++;
            }
            if(arg === '--fixed'){ fixed = columns; }else{ sparse = columns; }
        }else if(arg === '--output'){
            if(argv[i + 1] === undefined){
                throw new Error('tab-plus sparse: --output needs a value');
            }
            output = argv[i + 1];
            i += 2;
        }else if(arg.slice(0, 2) !== '--' && filename === null){
            filename = arg;
            i++;
        }else{
            throw new Error('tab-plus sparse: unrecognized argument: ' + arg);
        }
    }
    if(filename === null){
        throw new Error('tab-plus sparse: missing FILENAME');
    }
    if(fixed && sparse){
        const overlap = fixed.filter(function(column){ return sparse!.indexOf(column) !== -1; });
        if(overlap.length){
            throw new Error('tab-plus sparse: column(s) listed in both --fixed and --sparse: ' + overlap.join(', '));
        }
    }
    return {filename, under, fixed, sparse, output};
}

function defaultOutputName(filename: string): string {
    const ext = path.extname(filename);
    const base = filename.slice(0, filename.length - ext.length);
    return base + '-sparse' + ext;
}

interface ColumnStat {
    field: FieldValue;
    diffFromNull: number;
    diffFromFalse: number;
}

function computeColumnStats(fields: FieldValue[], rows: FieldValue[][]): ColumnStat[] {
    return fields.map(function(field, colIndex){
        let diffFromNull = 0;
        let diffFromFalse = 0;
        rows.forEach(function(row){
            const value = row[colIndex];
            if(value !== null){ diffFromNull++; }
            if(value !== 'false'){ diffFromFalse++; }
        });
        return {field, diffFromNull, diffFromFalse};
    });
}

interface ColumnDecision {
    sparse: boolean;
    defaultValue: FieldValue;
}

// decides, per column, whether it becomes sparse and, if so, against which default (null or 'false'):
// --fixed/--sparse force a decision for the columns they name; every other column is decided by the
// --under threshold, preferring a null default over a 'false' one when both would qualify
function decideColumns(fields: FieldValue[], rows: FieldValue[][], args: SparseArgs): Map<FieldValue, ColumnDecision> {
    const stats = computeColumnStats(fields, rows);
    const total = rows.length;
    const decisions = new Map<FieldValue, ColumnDecision>();
    stats.forEach(function(stat){
        const name = String(stat.field);
        if(args.fixed && args.fixed.indexOf(name) !== -1){
            decisions.set(stat.field, {sparse: false, defaultValue: null});
            return;
        }
        if(args.sparse && args.sparse.indexOf(name) !== -1){
            const defaultValue: FieldValue = stat.diffFromNull <= stat.diffFromFalse ? null : 'false';
            decisions.set(stat.field, {sparse: true, defaultValue});
            return;
        }
        if(qualifies(stat.diffFromNull, total, args.under)){
            decisions.set(stat.field, {sparse: true, defaultValue: null});
        }else if(qualifies(stat.diffFromFalse, total, args.under)){
            decisions.set(stat.field, {sparse: true, defaultValue: 'false'});
        }else{
            decisions.set(stat.field, {sparse: false, defaultValue: null});
        }
    });
    return decisions;
}

// a token inside the trailing sparse field uses the same escaping as a regular field (so \\, \r, \n, \t, |,
// \N, \E and control chars all work as usual), plus a literal space becomes \s since space is the separator
// between tokens within that field
function escapeSparseToken(value: FieldValue, options?: Options): string {
    return escapeField(value, options).replace(/ /g, '\\s');
}

function headerToken(name: FieldValue, defaultValue: FieldValue, options?: Options): string {
    const nameToken = escapeSparseToken(name, options);
    return defaultValue === null ? nameToken : nameToken + ':' + escapeSparseToken(defaultValue, options);
}

function dataToken(name: FieldValue, value: FieldValue, options?: Options): string {
    return escapeSparseToken(name, options) + ':' + escapeSparseToken(value, options);
}

function detectEol(text: string): string {
    return text.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
}

export function runSparse(argv: string[]): void {
    const args = parseSparseArgs(argv);
    const text = fs.readFileSync(args.filename, 'utf-8');
    const {fields, rows} = parseTab(text);
    const decisions = decideColumns(fields, rows, args);

    const regularFields = fields.filter(function(field){ return !decisions.get(field)!.sparse; });
    const sparseFields = fields.filter(function(field){ return decisions.get(field)!.sparse; });

    const headerLine = sparseFields.length === 0
        ? regularFields.map(function(field){ return escapeField(field); }).join('|')
        : regularFields.map(function(field){ return escapeField(field); })
            .concat(['\\: ' + sparseFields.map(function(field){
                return headerToken(field, decisions.get(field)!.defaultValue);
            }).join(' ')]).join('|');

    const dataLines = rows.map(function(row){
        const valueByField = new Map<FieldValue, FieldValue>();
        fields.forEach(function(field, i){ valueByField.set(field, row[i]); });

        const regularValues = regularFields.map(function(field){
            return escapeField(valueByField.get(field) as FieldValue);
        });
        if(sparseFields.length === 0){
            return regularValues.join('|');
        }
        const tokens = sparseFields
            .filter(function(field){ return valueByField.get(field) !== decisions.get(field)!.defaultValue; })
            .map(function(field){ return dataToken(field, valueByField.get(field) as FieldValue); });
        return regularValues.concat([tokens.join(' ')]).join('|');
    });

    const eol = detectEol(text);
    const outputContent = [headerLine].concat(dataLines).join(eol) + eol;
    const outputFilename = args.output || defaultOutputName(args.filename);
    fs.writeFileSync(outputFilename, outputContent, 'utf-8');

    process.stdout.write('tab-plus sparse: wrote ' + outputFilename + ' (' + sparseFields.length +
        ' sparse column' + (sparseFields.length === 1 ? '' : 's') + ' of ' + fields.length + ')\n');
}

function usage(): string {
    return [
        'Usage: tab-plus sparse FILENAME [options]',
        '',
        'Computes which columns have less than a threshold of values that differ from null (or from "false"),',
        'and rewrites the file with those columns encoded as sparse columns.',
        '',
        'Options:',
        '  --under N%       columns qualify when fewer than N% of rows differ from the default (default: 10%)',
        '  --under N        columns qualify when fewer than N rows differ from the default (absolute count)',
        '  --fixed COL...   force these columns to stay regular (non-sparse), regardless of --under',
        '  --sparse COL...  force these columns to become sparse, regardless of --under',
        '  --output NAME    output filename (default: FILENAME with a "-sparse" suffix before the extension)',
        ''
    ].join('\n');
}

export function main(argv: string[]): void {
    if(argv.length === 0 || argv[0] === '--help' || argv[0] === '-h'){
        process.stdout.write(usage());
        return;
    }
    const command = argv[0];
    try{
        if(command === 'sparse'){
            runSparse(argv.slice(1));
            return;
        }
        throw new Error('tab-plus: unknown command "' + command + '"\n\n' + usage());
    }catch(err){
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(message + '\n');
        process.exitCode = 1;
    }
}
