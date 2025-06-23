# bazel-import README

Automatically add Bazel deps to build files when TS imports are included in a file.

## Features

This extension detects change to TS files, takes note of _new_ `import` statements, looks up corresponding Bazel build targets, and adds them to the nearest build file with `buildozer`.

<span style="color:blue;font-weight:bold">[BETA]</span> This extension detects changes to TS files, takes note of _removed_ `import` statements, checks other source files in the package, and deletes the dependencies from the nearest build file with `buildozer` _if_ the dependency no longer exists.

## Requirements

This extension assumes:

- your TS Bazel target names match the location of your build files
- you have `buildozer` installed on your system
- your changes capture a full import (i.e., line adds/deletes instead of single character adds/deletes)

## Extension Settings

This extension contributes the following settings:

- `bazel-import.buildFile`: The file name convention where your build targets are defined
- `bazel-import.targetPrefixes`: Path prefixes that should be considered for auto-adding Bazel deps
- `bazel-import.importPathPrefixes`: Target prefixes that should be considered for auto-adding Bazel deps
- `bazel-import.externalTargets`: External dependency path previxes and their associated external build targets
- `bazel-import.notifyChange`: Notify the user that a build file has been updated
- `bazel-import.enableDeletions`: Enables deletion analysis <span style="color:blue;font-weight:bold">[BETA]</span>
- `bazel-import.maxPackageSize`: Maximum package size to be considered for deletion <span style="color:blue;font-weight:bold">[BETA]</span>
- `bazel-import.maxCacheSize`: Maximum packages to cache <span style="color:blue;font-weight:bold">[BETA]</span>

## Release Notes

### 0.0.1

Initial release
