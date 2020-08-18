## [Unreleased]

### Fixed 
- 3 arguments bug while compiling
- wrong name in app.conf
- check for `true` in env variables now compares to `true`, `'true'` and `1`
### Added 
- README.md build manual for linux added
- MapRenderer creates lockfiles before manipulating existing map tiles to avoid 2 renderer working on the same file resulting in missing parts
- delay of 250ms between rendering tries after lockfile was found
- due to new API we can now also read raw tiles from the local system (must be installed on the gameserver)
- Config setting to turn on websocket server (for map file transfer and live data)
- Docker files
### Changed
- refactoring project structure
- using `yarn` instead of npm now
- using `process.env`  instead of json files now
- map files now have an additional subdirectory indicating the source

## [0.1.0] - 2019-02-27
### Initial