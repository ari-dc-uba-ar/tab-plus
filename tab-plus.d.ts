export interface Tab {
    fields: string[];
    rows: string[][];
}

/** Turns the raw (still escaped) text of one field into its real value. */
export function unescapeField(rawValue: string): string;

/** Turns a field's real value into raw (escaped) text safe to embed between '|' separators. */
export function escapeField(value: string): string;

/** Parses one raw line (without CR/LF) into an array of field values. */
export function parseRow(rawRow: string): string[];

/** Generates one raw line (without CR/LF) from an array of field values. */
export function generateRow(row: string[]): string;

/** Parses the full content of a .tab file into {fields, rows}. */
export function parseTab(text: string): Tab;

/** Generates the full content of a .tab file from {fields, rows}. */
export function generateTab(tab: Tab): string;
