/**
 * Information format from `json` output of a bazel query for sources and deps
 * 
 * e.g., name: `deps`, stringListValue: _list of deps_
 */
export interface Attribute {
    name: string;
    stringListValue: string[];
}
