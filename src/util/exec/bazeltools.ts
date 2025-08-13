import { executeCommand, processCommandStream } from './exectools';
import { fsToRelativePath, getRoot } from '../path/filepathtools';
import { PkgContext } from '../../model/bazelquery/filescontext';
import { Attribute } from '../../model/bazelquery/attribute';
import { TargetInfo } from '../../model/bazelquery/targetinfo';
import { getConfig } from '../../config/config';
import { isRejection, isSpawnError } from './error';
import { showErrorMessage, showWarning } from '../../ui/userinteraction';

const KIND_PATTERN = getConfig("kindPattern");

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
        `kind("${KIND_PATTERN}", same_pkg_direct_rdeps(${relativePaths}))`,
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
        handleBazelError(error);
        return new PkgContext();
    }
}

function handleBazelError(error:unknown) {
    console.error(error);
    if (isSpawnError(error)) {
        if (error.errno === -7) {
            showErrorMessage("Spawned process has too many arguments");
            return;
        }
        showErrorMessage('System error');
        return;
    }
    if (!isRejection(error)) {
        return;
    }
    switch(error.error.code) {
        case 2:
            showErrorMessage("Error in arguments. Verify your kindPattern configuration");
            break;
        case 3:
            showWarning("Partial success");
            break;
        case 7:
            showErrorMessage("Command failed");
            break;
        default:
            showErrorMessage("Error occured in bazel query");

    }
}

// Sets a value on a map without overwriting
function setSafe<K,V>(map: Map<K,V>, key: K, value: V) {
    if (map.has(key)) {
        console.debug(`Attempted to overwrite ${key}:${map.get(key)} with ${value}`);
    } else {
        map.set(key, value);
    }
}

/**
 * Attempts to shut down Bazel, first gracefully, then forcefully if necessary.
 * @param timeoutMs - The time to wait for a graceful shutdown before forcing it.
 */

export async function forceBazelShutdown(timeoutMs = 2000) {
    try {
        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Graceful shutdown timed out')), timeoutMs)
        );

        // Race the shutdown command against the timeout
        await Promise.race([
            executeCommand('bazel shutdown', getRoot()),
            timeoutPromise
        ]);

        return;

    } catch (error) {
        console.warn(`Graceful shutdown failed: ${error}. Attempting forceful kill.`);

        try {
            const pid = await executeCommand('bazel info server_pid', getRoot());
            if (pid && pid.trim()) {
                await executeCommand(`kill -9 ${pid.trim()}`);
                console.debug(`Successfully killed Bazel server with PID: ${pid.trim()}`);
            } else {
                console.debug('Bazel server process not found.');
            }
        } catch (killError) {
            console.error(`Failed to forcefully kill Bazel: ${killError}`);
            throw killError;
        }
    }
}
