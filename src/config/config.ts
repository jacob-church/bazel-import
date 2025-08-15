import * as vscode from 'vscode';
import { BUILDFILE, ConfigKey } from './generated';

// Commands
export const FIX_DEPS_COMMAND = "bazel-import.fixDeps";
export const OPEN_BAZEL_COMMAND = "bazel-import.openBazel";

// Identifiers
export const TS_LANGUAGE_ID = 'typescript';
export const MAIN_CONFIG = 'bazel-import';
export const BUILD_FILE: string = getConfig(BUILDFILE);

/**
 * Gets a configuration value from the extension's configuration
 * 
 * e.g., `properties: {
 *  "<section>.<subsection>" : {...}, ... 
 * }`
 * @param subsection the name of the value
 * @param section defaults to the main config
 * @returns a configuration value if it exists
 */
export function getConfig(subsection: ConfigKey): any {
    const configValue = vscode.workspace.getConfiguration(MAIN_CONFIG).get(subsection);
    return configValue;
}