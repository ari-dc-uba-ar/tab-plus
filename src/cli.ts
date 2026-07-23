import * as fs from 'fs';
import * as path from 'path';
import {cli, command} from 'cleye';
import {RowObject, parseTab, generateTab} from './tab-plus';
import {parseThreshold, defaultThreshold, decideSparseColumns} from './auto-tab-plus';

// cleye/formats is only reachable through package.json's conditional "exports" map, which the rest of this
// project's TypeScript setup (moduleResolution: node10, needed to keep tab-plus.ts's own module UMD/browser
// friendly) doesn't resolve; a plain comma-split is all commaList(String) would have given us here anyway
function commaList(raw: string): string[] {
    return raw.split(',');
}

function defaultOutputName(filename: string): string {
    const ext = path.extname(filename);
    const base = filename.slice(0, filename.length - ext.length);
    return base + '-sparse' + ext;
}

export interface SparseArgs {
    filename: string;
    under: string | undefined;
    fixed: string[] | undefined;
    sparse: string[] | undefined;
    output: string | undefined;
}

export function runSparse(args: SparseArgs): void {
    if(args.fixed && args.sparse){
        const overlap = args.fixed.filter(function(column){ return args.sparse!.indexOf(column) !== -1; });
        if(overlap.length){
            throw new Error('tab-plus sparse: column(s) listed in both --fixed and --sparse: ' + overlap.join(', '));
        }
    }
    const text = fs.readFileSync(args.filename, 'utf-8');
    const tab = parseTab(text);
    const decided = decideSparseColumns(tab.fields, tab.rows, tab.columnDefs, {
        under: args.under === undefined ? defaultThreshold : parseThreshold(args.under),
        fixed: args.fixed,
        sparse: args.sparse
    });

    // generateTab expects row values in `decided.fields` order once given as objects; row objects sidestep
    // having to reorder the plain FieldValue[] rows ourselves to match decided.columnDefs' common/sparse split
    const rows: RowObject[] = tab.rows.map(function(row){
        const rowObject: RowObject = {};
        tab.fields.forEach(function(field, i){
            rowObject[String(field)] = row[i];
        });
        return rowObject;
    });

    const outputContent = generateTab({fields: decided.fields, columnDefs: decided.columnDefs, rows});
    const outputFilename = args.output || defaultOutputName(args.filename);
    fs.writeFileSync(outputFilename, outputContent, 'utf-8');

    const sparseCount = decided.fields.filter(function(field){
        return decided.columnDefs[String(field)].sparseDefault !== undefined;
    }).length;
    process.stdout.write('tab-plus sparse: wrote ' + outputFilename + ' (' + sparseCount +
        ' sparse column' + (sparseCount === 1 ? '' : 's') + ' of ' + decided.fields.length + ')\n');
}

const sparseCommand = command({
    name: 'sparse',
    parameters: ['<filename>'],
    flags: {
        under: {
            type: String,
            description: 'columns qualify when fewer than this fraction ("10%") or count ("10") of rows differ ' +
                'from the default (default: "10%")'
        },
        fixed: {
            type: commaList,
            description: 'comma-separated columns to force regular (non-sparse); other columns keep the ' +
                'computed/original status'
        },
        sparse: {
            type: commaList,
            description: 'comma-separated columns to force sparse; other columns keep the computed/original status'
        },
        output: {
            type: String,
            alias: 'o',
            description: 'output filename (default: FILENAME with a "-sparse" suffix before the extension)'
        }
    },
    help: {
        description: 'For each column, checks 7 candidate default values (adjacent separators, \\E, \\N, "1", ' +
            '"0", "true", "false") and picks whichever leaves the fewest rows differing; if that\'s under the ' +
            'threshold, the column is rewritten as a sparse column against that default.',
        examples: ['tab-plus sparse countries.tab', 'tab-plus sparse countries.tab --under 15%',
            'tab-plus sparse countries.tab --fixed mediterraneo --output countries2.tab']
    }
}, function(argv){
    runSparse({
        filename: argv._.filename,
        under: argv.flags.under,
        fixed: argv.flags.fixed,
        sparse: argv.flags.sparse,
        output: argv.flags.output
    });
});

export function main(argv: string[]): void {
    try{
        const parsed = cli({
            name: 'tab-plus',
            commands: [sparseCommand],
            help: {description: 'Utilities for .tab files.'}
        }, undefined, argv);
        if(parsed.command === undefined){
            parsed.showHelp();
        }
    }catch(err){
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(message + '\n');
        process.exitCode = 1;
    }
}
