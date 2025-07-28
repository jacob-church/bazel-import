# bazel-import README

Automatically add/remove Bazel deps to build files when TS imports are included in a file. Manually fix Bazel deps when TS imports are modified.

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
- `bazel-import.externalTargets`: External dependency path previxes and their associated external build targets
- `bazel-import.notifyChange`: Notify the user that a build file has been updated
- `bazel-import.excludeDependencies`: Excludes dependencies from the manual tool. Use for hidden dependencies. You can find hidden dependencies by querying the dependency label on your build file and comparing with the dependency array in the build file <span style="color:blue;font-weight:bold">[BETA]</span>
- `bazel-import.enableDeletion`: Toggles automatic deletions <span style="color:blue;font-weight:bold">[BETA]</span>
- `bazel-import.maxPackageSize`: Maximum package size to be considered for deletion <span style="color:blue;font-weight:bold">[BETA]</span>
- `bazel-import.maxCacheSize`: Maximum packages to cache <span style="color:blue;font-weight:bold">[BETA]</span>

## Release Notes

### 0.0.1

Initial release
