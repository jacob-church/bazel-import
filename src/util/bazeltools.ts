import * as path from 'path';
import { executeCommand, processCommandStream } from './exectools';
import { fsToRelativePath, fsToWsPath, getRoot } from './filepathtools';

export interface TargetInfo {
    name: string,
    srcs: string[],
    deps: string[]
}

export interface FilesContext<K,M,V> {
    has(wsPath: K): boolean
    getTarget(wsPath: K): M | undefined
    getInfo(wsPath: K): V | undefined
    empty(): boolean

    // Relative path to target
    targetMap: Map<K, M>,
    targetInfos: Map<M, V>
}

class PkgContext implements FilesContext<string,string,TargetInfo> {
    targetMap: Map<string, string>;
    targetInfos: Map<string, TargetInfo>;
    
    constructor(targetMap?: Map<string, string>, targetInfos?: Map<string, TargetInfo>) {
        this.targetMap = targetMap ?? new Map();
        this.targetInfos = targetInfos ?? new Map();
    }
    
    public has(wsPath: string): boolean {
        return this.targetMap.has(wsPath);
    }
    
    public getTarget(wsPath: string): string | undefined {
        return this.targetMap.get(wsPath);
    }
    
    public getInfo(wsPath: string): TargetInfo | undefined {
        const target = this.getTarget(wsPath);
        if (target === undefined) {
            return undefined;
        }
        return this.targetInfos.get(target);

    }
    
    public empty(): boolean {
        return (this.targetInfos.size === 0 && this.targetMap.size === 0);
    }
}

interface Attribute {
    name: string,
    stringListValue: string[]
}

export async function getTargetInfosFromFilePaths(filePaths: string[]): Promise<FilesContext<string,string,TargetInfo>> {
    const relativePaths = filePaths.map(fsToWsPath).join(' + ');
    const output = "--output streamed_jsonproto";
    const cwd = getRoot();
    const command = `bazel query 'kind(ts_library, ${relativePaths})' ${output}`;
    const targetInfos = new Map<string, TargetInfo>();
    const targetMap = new Map<string, string>();
    try {
        const infos = await executeCommand(command, cwd);
        const result = infos.trim().split('\n').map(rule => JSON.parse(rule));
        for (const res of result) {
            const attrs: Attribute[] = res.rule.attribute;
            const deps = attrs.find((attr) => attr.name === 'deps');
            const srcs = attrs.find((attr) => attr.name === 'srcs');
            const name = res.rule.name;
            const info = {
                name: name,
                srcs: srcs?.stringListValue ?? [],
                deps: deps?.stringListValue ?? []
            };

            setSafe(targetInfos, name, info);
            for (const src of info.srcs) {
                const srcFile = src.replace(':', '/');
                setSafe(targetMap, srcFile, name);
            }
        }
        return new PkgContext(
            targetMap,
            targetInfos
        );
    } catch (error) {
        console.error(error);
        return new PkgContext();
    }
}

export async function streamTargetInfosFromFilePaths(filePaths: string[]) {
    const relativePaths = filePaths.map(fsToRelativePath).join(' + ');
    const cwd = getRoot();
    const targetInfos = new Map<string, TargetInfo>();
    const targetMap = new Map<string, string>();
    const command = 'bazel';
    const args = [
        'query',
        `kind(ts_library, same_pkg_direct_rdeps(${relativePaths}))`,
        '--output',
        'streamed_jsonproto'
    ];

    try {
        await processCommandStream(command, args, (res) => {
            const attrs: Attribute[] = res.rule.attribute;
            const deps = attrs.find((attr) => attr.name === 'deps');
            const srcs = attrs.find((attr) => attr.name === 'srcs');
            const name = res.rule.name;
            const info = {
                name: name,
                srcs: srcs?.stringListValue ?? [],
                deps: deps?.stringListValue ?? []
            };

            setSafe(targetInfos, name, info);
            for (const src of info.srcs) {
                const srcFile = src.replace(':', '/');
                setSafe(targetMap, srcFile, name);
            }
        }, cwd);

        return new PkgContext(
            targetMap,
            targetInfos
        );
    } catch (error) {
        console.error(error);
        return new PkgContext();
    }
}


// Sets a value on a map without overwriting
export function setSafe<K,V>(map: Map<K,V>, key: K, value: V) {
    if (map.has(key)) {
        console.debug(`Attempted to overwrite ${key}:${map.get(key)} with ${value}`);
    } else {
        map.set(key, value);
    }
}


export async function getTargetsFromFilePaths(filePaths: string[]): Promise<string[]> {
    const relativePaths = filePaths.map(fsToRelativePath).join(' + ');
    const cwd = getRoot();
    const command = `bazel query 'kind(ts_library, same_pkg_direct_rdeps(${relativePaths}))'`;

    try {
        const targetString = await executeCommand(command, cwd);
        const targets = targetString.trim().split('\n');
        return targets;
    } catch (error) {
        console.error(error);
        return [];
    }
}