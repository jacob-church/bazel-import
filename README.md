# bazel-import README

Automatically add/remove Bazel deps to build files when TS imports are included in or removed from a file. Manually fix Bazel deps.

## Features

This extension detects change to TS files, takes note of _new_ `import` and `require` statements, looks up corresponding Bazel build targets, and adds them to the nearest build file with `buildozer`.

This extension detects changes to TS files, takes note of _removed_ `import` and `require` statements, checks other source files in the package, and deletes the dependencies from the nearest build file with `buildozer` _if_ the dependency no longer exists.

This extension allows you to run dependency fixes on a user-selected file. It will update the build dependencies for the package in which the selected file is located, including both added and removed dependencies.

## Requirements

This extension assumes:

- you have `buildozer` installed on your system
- you have `bazel` installed on your system
- your changes capture a full import for automated updates (i.e., line adds/deletes instead of single character adds/deletes)
- your build files have dependency array for manual updates
- your vscode workspace folder is the same as your [bazel workspace/repository root](https://bazel.build/concepts/build-ref)
- your external dependencies are npm packages

## Extension Settings

This extension contributes the following settings:

<details> 
<summary><code>bazel-import.buildFile</code></summary> 
The file name convention where your build targets are defined
</details>

<details>
<summary><code>bazel-import.notifyChange</code></summary> 
Notify the user that a build file has been updated
</details>

<details> 
<summary><code>bazel-import.enableDeletion</code></summary>
Toggles automatic deletions 
</details>

<details> 
<summary><code>bazel-import.enableAddition</code></summary> 
Toggles automatic additions 
</details>

<details> 
<summary><code>bazel-import.maxPackageSize</code></summary> 
Maximum package size to be considered for deletion 
</details>
<details> 
<summary><code>bazel-import.maxCacheSize</code></summary> 
Maximum packages to cache 
</details>

<details> 
<summary><code>bazel-import.excludeDependencies</code></summary> 
Excludes dependencies from the dependency fix. Use for hidden dependencies, which you can find by querying the dependency label on your build file and comparing with the dependency array in the build file
</details>

<details> 
<summary><code>bazel-import.fixDepsOnCurrent</code></summary> 
Automatically run deps fix on the current file instead of prompting the user to select one. Default <code>false</code>
</details>

<details> 
<summary><code>bazel-import.kindPattern</code></summary> 
Pattern that selects the kind of rules for analysis. Uses this to find the bazel target to which a source file belongs. See bazel query <a href="https://bazel.build/query/language#kind">documentation </a> for `kind(pattern, ...)` for more information 
</details>

<details> 
<summary><code>bazel-import.importPathReplacements</code></summary> 
Replaces matches in fully qualified import paths.

For example, if an import path refers to generated files that lack build information, you can replace parts of those file paths to refer to generator files with build information.

</details>

<details> 
<summary><code>bazel-import.defaultRoot</code></summary> 
Default path relative to the home directory for running commands if no workspace folder is found. The default bazel repository root
</details>

<details>
<summary><code>bazel-import.bazelShutdownOnActivation</code></summary>
Shuts down a currently running bazel server when the extension first activates. May be useful for fixing issues with the bazel server.

Off by default.

</details>

## Release Notes

### 1.0.0

Uses bazel queries for increased accuracy. Adds the ability to disable automatic additions and to run fix deps on the current file without prompting the user for a file selection.

Fixes issue where the open bazel file command would not open the bazel file

#### Removed settings:

- External dependencies
- Target prefixes
- Import path prefixes

#### Added settings:

- Toggle additions
- Fix deps on current file

##### Advanced settings

- Kind pattern
- Import path replacements
- Default Root
- Bazel shutdown on activation

### 0.1.3

Registers a command to the extension (`bazel-import.fixDeps`) the runs dependency fix

Increased default `maxPackageSize` to 100, which can be modified in the settings. Enabled automatic deletion by default. This can be turned off by setting `enabledDeletion` to `false` in the settings

### 0.1.2

Fixes a critical bug in the dependencies

### 0.1.1 <span style="color:red;font-weight:bold">[Broken]</span>

Do **not** use this version. Upgrade to v0.1.2 or later

Fixes a bug with that would add self-dependencies to build files

### 0.1.0 <span style="color:red;font-weight:bold">[Broken]</span>

Do **not** use this version. Upgrade to v0.1.2 or later

#### Dependency removal

Monitors changes to TS files for removed import statements and deletes the dependencies from the nearest build file if the dependency no longer exists.

- Disabled by default. Enable by setting `enableDeletion` to true in the extension settings
- Default size is 10. `maxPackageSize` determines the number of source files for deletion to run.

#### Dependency fix

Updates the build dependencies for the package in which the selected file is located, including both added and removed dependencies.

- Activated by clicking the status bar icon in the bottom right and selecting the current file or picking another ts/bazel file from the system file selector.

#### Status bar icon

- **If** deletions are enabled, displays as a magic wand when the file is ready, a closed eye when the file is not supported, and a loading icon while the package is loading
- **Otherwise** appears as a magic wand
- On click allows users to a select a file. The dependencies for the packaging containing the file will be updated

### 0.0.4

Bug fixes

### 0.0.3

Bug fixes

### 0.0.2

Add bazel imports and command to open nearest build file

### 0.0.1

_Initial release_
