## [Unreleased]
### Fixed 
- 3 arguments bug while compiling
- wrong name in app.conf
### Added 
- MapRenderer creates lockfiles before manipulating existing map tiles to avoid 2 renderer working on the same file resulting in missing parts
- delay of 250ms between rendering tries after lockfile was found
- due to new API we can now also read raw tiles from the local system (must be installed on the gameserver)
### Notes
- the websocket code is still implemented, it may be possible to have both ways in the future in case someone cant install this on his gameserver. Therefore the new Plugin needs to have a websocket client to send the tiles (WIP)

## [0.1.0] - 2019-02-27
### Initial