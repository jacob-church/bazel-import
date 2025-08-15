import { TargetInfo } from './targetinfo';

export class PkgContext {
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
