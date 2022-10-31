# bazel-import README

Automatically add Bazel deps to build files when TS imports are included in a file.

## Features

This extension detects change to TS files, takes notes of _new_ `import` statements, looks up corresponding Bazel build targets, and adds them to the nearest build file with `buildozer`.

## Requirements

This extension assumes:

-   your TS Bazel target names match the location of your build files
-   you have `buildozer` installed on your system

## Extension Settings

This extension contributes the following settings:

-   `bazel-import.buildFile`: The file name convention where your build targets are defined
-   `bazel-import.targetPrefixes`: Path prefixes that should be considered for auto-adding Bazel deps
-   `bazel-import.importPathPrefixes`: Target prefixes that should be considered for auto-adding Bazel deps
-   `bazel-import.externalTargets`: External dependency path previxes and their associated external build targets
-   `bazel-import.notifyChange`: Notify the user that a build file has beend updated

## Release Notes

### 0.1

Initial release
