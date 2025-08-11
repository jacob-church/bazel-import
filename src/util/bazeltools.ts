import * as vscode from 'vscode';
import { executeCommand, processCommandStream } from './exectools';
import { fsToRelativePath, fsToWsPath, getRoot } from './filepathtools';
import { FilesContext, PkgContext } from '../model/bazelquery/filescontext';
import { Attribute } from '../model/bazelquery/attribute';
import { TargetInfo } from '../model/bazelquery/targetinfo';
import { getConfig } from '../config/config';

const LIBRARY_REGEX = getConfig("libraryRegex");

/**
 * Prefer streaming the results unless the results are small enough to avoid overflowing the buffer on stdout
 * @param filePaths a list of file paths
 * @returns the package info for each of the file paths mapped in an accessible format
 */
export async function getTargetInfosFromFilePaths(filePaths: string[]): Promise<FilesContext<string,string,TargetInfo>> {
    const relativePaths = filePaths.map(fsToWsPath).join(' + ');
    const output = "--output streamed_jsonproto";
    const cwd = getRoot();
    const command = `bazel query 'kind("${LIBRARY_REGEX}", ${relativePaths})' ${output}`;
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

/**
 * Streams a bazel query, handling larger numbers of imports/package sizes without overflowing the buffer
 * @param filePaths a list of file paths
 * @returns the package info for each of the file paths mapped in an accessible format
 */
export async function streamTargetInfosFromFilePaths(filePaths: string[]) {
    const relativePaths = filePaths.map(fsToRelativePath).join(' + ');
    const cwd = getRoot();
    const targetInfos = new Map<string, TargetInfo>();
    const targetMap = new Map<string, string>();
    const command = 'bazel';
    const args = [
        'query',
        `kind("${LIBRARY_REGEX}", same_pkg_direct_rdeps(${relativePaths}))`,
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
    const command = `bazel query 'kind("${LIBRARY_REGEX}", same_pkg_direct_rdeps(${relativePaths}))'`;

    try {
        const targetString = await executeCommand(command, cwd);
        const targets = targetString.trim().split('\n');
        return targets;
    } catch (error) {
        console.error(error);
        return [];
    }
}