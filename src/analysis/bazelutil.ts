import { exec } from 'child_process';

export async function getBazelDeps(target: string, cwd: string, excludedTargets?: string[]): Promise<string> {
    let command = `bazel query "labels(deps, ${target})"`;

    if (excludedTargets && excludedTargets.length > 0) {
        const excludePart = excludedTargets.map(path => `except ${path}/...`).join(' ');
        const excludeCommand = `${command} ${excludePart}`;
        try {
            return await executeCommand(excludeCommand, cwd);
        }
        catch (error) {
            console.error("Error in except command, retrying without it");
        }
    }

    console.debug(`Executing ${command} in ${cwd}`);

    return await executeCommand(command, cwd);
}

export async function executeCommand(command: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(command, {cwd: cwd}, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                if (stderr) {
                    console.error(`stderr: ${stderr}`);
                };
                return reject(new Error(`Command failed with exit code ${error.code}: ${stderr || error.message}`));
            }
            if (stderr) {
                console.warn(`stderr: ${stderr}`);
            }
            resolve(stdout);
        });
    });
}
