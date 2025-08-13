# Change Log

All notable changes to the "bazel-import" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added

- Ability to exclude/include directories in automatic dependency updates

## [1.0.0] - 2025-08-14

### Added

- Automatic additions now toggleable with `enableAdditions`
- Run fix deps on the current file without prompting the user with `fixCurrentDeps`
- Specify the pattern to search for in a `kind` bazel query with `kindPattern`
- Specify the fallback directory to run bazel queries (primarily) with `defaultRoot`
- Support for unconventional import structures e.g., automatically generated files whose build files are located with the generators with `importPathReplacements`
- Shutdown the currently running bazel server if one exists on extension activation with `bazelShutdownOnActivation`
- Parse external dependencies from the ts file path resolver
  - Excludes imports that are in built in modules automatically
  - Known bugs include a lack of support for @type node dependencies
- Partial support for `require('...')` imports
- Scripts to automatically generate a type definition and string exports that contain the names of configurations in the current package.json, allowing better sync and validation of configuration access
  - `npm run compile:scripts` compiles the `scripts` directory
  - `npm run compile:all` compiles both the `src` and `scripts` directories
  - `npm run config` generates the type definition and string exports in `src/config/generated.ts`
- Cache invalidation for removed or added files so that a package that is already loaded in the cache will not use missing files but will use newly added files in computing dependencies

### Removed

- External dependencies setting
- Unused target and import path settings

### Changed

- Migrated to using bazel query to determine the target of a file instead of the structure. This is slightly slower than the previous version, but is necessary when more than one target is in a bazel build file
- Converts file paths to uris only when needed instead of greedily
- Updated test stubbing to work with bazel queries

## [0.1.3] - 2025-07-29

### Added

- Command for deps fix: `bazel-import.fixDeps`
- Counts to successful remove and add messages

### Changed

- Enabled deletions by default
- Increased max package size from 10 to 100

### Removed

- Deletion enabled/disabled message on every active file switch (File deletion status still displayed in the status bar tooltip)

## [0.1.2] - 2025-07-25

### Fixed

- Extension dependencies—Do not use v0.1.1 or v0.1.0 due to broken dependencies

## [0.1.1] - 2025-07-25 [BROKEN]

### Fixed

- Bug that could add a self-dependency to build files

## [0.1.0] - 2025-07-25 [BROKEN]

### Added

- Dependency deletion—deletes dependencies that no longer exist from the corresponding build file
- Subprocess logic for bazel queries and buildozer
- Alert and process for updating `maxPackageSize` for automatic deletions
- Dependency fix—fix dependencies for a user-selected package
- Status bar icon that informs users of the document's status and fixes dependencies when clicked
- End-to-end tests for new features (dependency fix and dependency deletion)

### Changed

- Dependencies calculated directly instead of relying on emulating vscode ctrl-click
- Buildozer run as subprocess instead of as a terminal instance
- Reorganized the extension structure

## [0.0.4] - 2025/02/19

### Changed

- Increment extension version

## [0.0.3] - 2025/02/19

### Changed

- Only add dependencies to the build file if the changes were made to the active file

## [0.0.2] - 2024/11/15

### Added

- Add dependencies to the build target of a file when imports are added to it
- Command to go to the nearest build file: `bazel-import.openBazel`

## [0.0.1] - 2022/10/31

_Initial release_
