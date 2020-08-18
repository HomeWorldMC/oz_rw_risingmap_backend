
# Introductiom
This is the node-backend part of my RisingMaps-Plugin for Rising World. It renders map images out of raw map tiles collected by players wandering around the map (with a map in their inventory).
If you want to use your own rendering service i recommend the `docker-prebuild` version (see below).

# Build from source
If you can install all dependencies on your Server, i recommend to build it from source.

## Linux build (Debian 10 (atleast 8))

Some actions may require root access!

```bash
# General requirements (especially for node-canvas)
curl -sL https://deb.nodesource.com/setup_14.x | bash -
apt install -y nodejs
apt install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev git;
npm i -g npm typescript; # update npm to newest version and install typescript compiler

# cloning and compiling this repository
mkdir -p /srv/apps/;
cd /srv/apps;
git clone git@github.com:Devidian/oz_rw_risingmap_backend.git;
cd oz_rw_risingmap_backend;
cp config/config.default.json config/config.json;
nano config/config.json;  # Edit config.json for your needs
yarn; # install dependencies
tsc; #compile
node bin/main; #run test, CTRL+C to end
./app-init.sh; # enables systemd service and starts the service

# For updates (do not modify files other that config.json! Update resets all other changes)
./app-update.sh
```

## Windows build
soon... (maybe on request)

# using docker
```ps
docker build -t rwrmbe .
docker run -dp 21338:21338 --name RW-RM-Backend rwrmbe
```

## using docker-composer (local)

```bash
# start
docker-composer up -d
# rebuild
docker-composer up -d --build
#stop
docker-composer down
```

## using docker-composer (prebuild)
- create `docker-compose.yml` and `.env` in a directory
- copy contents below and adjust for your needs

### docker-compose.yml
```yml
version: '3.1'
services:

  rwmapbackend:
    image: devidian/rw-map-backend
    restart: always
    container_name: node_rw_map_backend
    volumes:
      - maptiles:/srv/www/rwmap/tiles
    ports:
      - 21338:21338
    environment:
      APP_TITLE: ${APP_TITLE}
      APP_WSS_ENABLED: ${APP_WSS_ENABLED}
      APP_WSS_PORT: ${APP_WSS_PORT}
      APP_WSS_HOST: ${APP_WSS_HOST}
      APPLOGLEVEL: ${APP_LOGLEVEL}
      APPLOGCOLOR: ${APP_LOGCOLOR}
      MAP_GAMESERVER: ${MAP_GAMESERVER}
      MAP_RAW_PATH: ${MAP_RAW_PATH}
      MAP_DESTINATION_PATH: ${MAP_DESTINATION_PATH}
      RENDERER_NODES: ${RENDERER_NODES}
      RENDERER_TICK: ${RENDERER_TICK}

volumes:
  maptiles:

```
### .env
```ini
APP_TITLE=RisingMap-BE
APP_WSS_PORT=21338
APP_WSS_HOST=localhost
APP_LOGLEVEL=0
APP_LOGCOLOR=true

# if you use docker set GAMESERVER=false (or mount volume)
MAP_GAMESERVER=false
MAP_RAW_PATH=/mnt/s/SteamLibrary/steamapps/common/RisingWorld/plugins/RisingMaps/tiles/

MAP_DESTINATION_PATH=/srv/www/rwmap/tiles

RENDERER_NODES=4
RENDERER_TICK=20
```