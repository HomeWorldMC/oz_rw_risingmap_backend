## [Unreleased]
### Fixed 
- 3 arguments bug while compiling
- wrong name in app.conf
### Added 
- MapRenderer creates lockfiles before manipulating existing map tiles to avoid 2 renderer working on the same file resulting in missing parts
- delay of 250ms between rendering tries after lockfile was found 

## [0.1.0] - 2019-02-27
### Initial