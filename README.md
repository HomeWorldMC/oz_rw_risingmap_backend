
# Build from source
If you can install all dependencies on your Server, i recommend to build it from source.

## Linux build (Debian 9 (maybe works with 8))

Some actions may require root access!

```bash
# General requirements (especially for node-canvas)
curl -sL https://deb.nodesource.com/setup_10.x | bash -
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
npm i; # install dependencies
tsc; #compile
node bin/main; #run test, CTRL+C to end
./app-init.sh; # enables systemd service and starts the service

# For updates (do not modify files other that config.json! Update resets all other changes)
./app-update.sh
```

## Windows build
soon... (maybe on request)