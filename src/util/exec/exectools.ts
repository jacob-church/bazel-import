import { exec, spawn } from 'child_process';
import * as readline from 'readline';

export async function executeCommand(command: string, cwd?: string): Promise<string> {
    const options = cwd ? { cwd: cwd } : {};
    return new Promise((resolve, reject) => {
        exec(command, options, (error, stdout, stderr) => {
            if (error) {
                return reject({
                    "error": error,
                    "stderr": stderr
                });
            }
            if (stderr) {
                console.debug(`stderr: ${stderr}`);
            }
            resolve(stdout);
        });
    });
}

// Define a type for the callback function for clarity
type RuleHandler = (rule: any) => void;

/**
 * Executes a command and processes its stdout stream line-by-line,
 * parsing each line as JSON and calling a handler.
 */
export async function processCommandStream(command: string, args: string[], onRule: RuleHandler, cwd?: string): Promise<void> {
    const options = cwd ? { cwd } : {};

    return new Promise((resolve, reject) => {
        const child = spawn(command, args, options);
        let stderr = '';

        // Create a readline interface to handle lines and backpressure correctly
        const rl = readline.createInterface({ input: child.stdout });

        rl.on('line', (line) => {
            if (line) {
                try {
                    onRule(JSON.parse(line));
                } catch (e) {
                    console.error("Failed to parse JSON line:", line);
                }
            }
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('error', (error) => reject({ error, stderr }));

        child.on('close', (code) => {
            if (code !== 0) {
                const error = new Error(`Command failed with exit code ${code}`);
                return reject({ error, stderr });
            }
            resolve();
        });
    });
}

