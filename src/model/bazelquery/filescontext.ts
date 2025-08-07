import { TargetInfo } from './targetinfo';


export interface FilesContext<K, M, V> {
    has(wsPath: K): boolean;
    getTarget(wsPath: K): M | undefined;
    getInfo(wsPath: K): V | undefined;
    empty(): boolean;

    // Relative path to target
    targetMap: Map<K, M>;
    targetInfos: Map<M, V>;
}
export class PkgContext implements FilesContext<string, string, TargetInfo> {
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
