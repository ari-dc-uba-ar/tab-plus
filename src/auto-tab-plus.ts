import {FieldValue, ColumnDefs} from './tab-plus';

export interface Threshold {
    kind: 'relative' | 'absolute';
    value: number;
}

export const defaultThreshold: Threshold = {kind: 'relative', value: 0.10};

// a flag/option value like '10%' (relative, a fraction of the rows) or '10' (absolute, a plain row count)
export function parseThreshold(raw: string): Threshold {
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

function columnStat(rows: FieldValue[][], colIndex: number): {diffFromNull: number; diffFromFalse: number} {
    let diffFromNull = 0;
    let diffFromFalse = 0;
    rows.forEach(function(row){
        const value = row[colIndex];
        if(value !== null){ diffFromNull++; }
        if(value !== 'false'){ diffFromFalse++; }
    });
    return {diffFromNull, diffFromFalse};
}

export interface AutoSparseOptions {
    under: Threshold;
    fixed?: string[];
    sparse?: string[];
}

export interface DecidedColumns {
    // fields reordered: columns decided regular first (original relative order), then columns decided sparse
    // (original relative order) - the order generateTab/generateRow expect once paired with `columnDefs`
    fields: FieldValue[];
    columnDefs: ColumnDefs;
}

// decides, per column, whether it becomes sparse and, if so, against which default (null or 'false'):
//
// - a column named in `options.fixed` stays regular, regardless of its stats.
// - a column named in `options.sparse` becomes sparse, regardless of its stats (default: whichever of
//   null/'false' produces fewer differing rows).
// - when neither `options.fixed` nor `options.sparse` is given, every column is decided by the `options.under`
//   threshold: sparse against null if that qualifies, else sparse against 'false' if that qualifies, else regular.
// - when either is given, every OTHER column (not named in either list) keeps its original sparse/regular
//   status from `existingColumnDefs` (as returned by `parseTab`) instead of being recomputed - i.e. `--fixed`/
//   `--sparse` are manual overrides on top of whatever the input file already was, not a re-run of the
//   threshold on the rest.
export function decideSparseColumns(
    fields: FieldValue[], rows: FieldValue[][], existingColumnDefs: ColumnDefs | undefined, options: AutoSparseOptions
): DecidedColumns {
    const total = rows.length;
    const manualOverride = !!(options.fixed || options.sparse);
    const regularFields: FieldValue[] = [];
    const sparseFields: FieldValue[] = [];
    const sparseDefaults = new Map<FieldValue, FieldValue>();

    fields.forEach(function(field, colIndex){
        const name = String(field);
        let sparse: boolean;
        let defaultValue: FieldValue = null;

        if(options.fixed && options.fixed.indexOf(name) !== -1){
            sparse = false;
        }else if(options.sparse && options.sparse.indexOf(name) !== -1){
            const stat = columnStat(rows, colIndex);
            sparse = true;
            defaultValue = stat.diffFromNull <= stat.diffFromFalse ? null : 'false';
        }else if(manualOverride){
            const original = existingColumnDefs && existingColumnDefs[name];
            sparse = !!original && original.sparseDefault !== undefined;
            defaultValue = sparse ? original!.sparseDefault! : null;
        }else{
            const stat = columnStat(rows, colIndex);
            if(qualifies(stat.diffFromNull, total, options.under)){
                sparse = true;
                defaultValue = null;
            }else if(qualifies(stat.diffFromFalse, total, options.under)){
                sparse = true;
                defaultValue = 'false';
            }else{
                sparse = false;
            }
        }

        if(sparse){
            sparseFields.push(field);
            sparseDefaults.set(field, defaultValue);
        }else{
            regularFields.push(field);
        }
    });

    const columnDefs: ColumnDefs = {};
    regularFields.forEach(function(field, i){
        columnDefs[String(field)] = {position: i + 1};
    });
    sparseFields.forEach(function(field, i){
        columnDefs[String(field)] = {position: i + 1, sparseDefault: sparseDefaults.get(field)!};
    });

    return {fields: regularFields.concat(sparseFields), columnDefs};
}
