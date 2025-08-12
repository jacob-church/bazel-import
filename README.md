# bazel-import README

Automatically add/remove Bazel deps to build files when TS imports are included in or removed from a file. Manually fix Bazel deps when TS imports are modified.

## Features

This extension detects change to TS files, takes note of _new_ `import` statements, looks up corresponding Bazel build targets, and adds them to the nearest build file with `buildozer`.

<span style="color:blue;font-weight:bold">[BETA]</span> This extension detects changes to TS files, takes note of _removed_ `import` statements, checks other source files in the package, and deletes the dependencies from the nearest build file with `buildozer` _if_ the dependency no longer exists.

<span style="color:blue;font-weight:bold">[BETA]</span> This extension allows you to run dependency fixes on a user-selected file. It will update the build dependencies for the package in which the selected file is located, including both added and removed dependencies.

## Requirements

This extension assumes:

- your TS Bazel target names match the location of your build files
- you have `buildozer` installed on your system
- your changes capture a full import for automated updates (i.e., line adds/deletes instead of single character adds/deletes)
- your build files have dependency array for manual updates

## Extension Settings

This extension contributes the following settings:

- `bazel-import.buildFile`: The file name convention where your build targets are defined
- `bazel-import.targetPrefixes`: Path prefixes that should be considered for auto-adding Bazel deps
- `bazel-import.importPathPrefixes`: Target prefixes that should be considered for auto-adding Bazel deps
- `bazel-import.notifyChange`: Notify the user that a build file has been updated
- `bazel-import.excludeDependencies`: Excludes dependencies from the dependency fix. Use for hidden dependencies, which you can find by querying the dependency label on your build file and comparing with the dependency array in the build file <span style="color:blue;font-weight:bold">[BETA]</span>
- `bazel-import.enableDeletion`: Toggles automatic deletions <span style="color:blue;font-weight:bold">[BETA]</span>
- `bazel-import.enableAddition`: Toggles automatic additions
- `bazel-import.maxPackageSize`: Maximum package size to be considered for deletion <span style="color:blue;font-weight:bold">[BETA]</span>
- `bazel-import.maxCacheSize`: Maximum packages to cache <span style="color:blue;font-weight:bold">[BETA]</span>

## Release Notes

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
