# WaveTerm Commands

```bash
# @scripthaus command clean-all
# @scripthaus cd :playbook
echo "Cleaning all build artifacts, caches, and dependencies..."
rm -rf node_modules
rm -rf dist/
rm -rf dist-dev/
rm -rf dist-new/
rm -rf dist-dev-new/
rm -rf bin/
rm -rf build/
rm -rf .webpack-cache
rm -rf .yarn
rm -rf .pnp.*
echo "Clean complete. Run 'yarn install' to reinstall dependencies."
```

```bash
# @scripthaus command fresh-start
# @scripthaus cd :playbook
echo "Starting fresh build..."
scripthaus run clean-all
echo "Creating yarn.lock to establish project boundary..."
touch yarn.lock
echo "Installing dependencies with Yarn..."
yarn install
echo "Rebuilding electron..."
node_modules/.bin/electron-rebuild
echo "Building webpack..."
node_modules/.bin/webpack --config webpack.config.new.js --env dev
echo "Fresh start complete! You can now run 'scripthaus run electron-new'"
```

```bash
# @scripthaus command webpack-watch
# @scripthaus cd :playbook
node_modules/.bin/webpack --env dev --watch
```

```bash
# @scripthaus command webpack-build
# @scripthaus cd :playbook
node_modules/.bin/webpack --env dev
```

```bash
# @scripthaus command webpack-build-prod
# @scripthaus cd :playbook
node_modules/.bin/webpack --env prod
```

```bash
# @scripthaus command webpack-watch-new
# @scripthaus cd :playbook
node_modules/.bin/webpack --config webpack.config.new.js --env dev --watch
```

```bash
# @scripthaus command webpack-build-new
# @scripthaus cd :playbook
node_modules/.bin/webpack --config webpack.config.new.js --env dev
```

```bash
# @scripthaus command webpack-build-prod-new
# @scripthaus cd :playbook
node_modules/.bin/webpack --config webpack.config.new.js --env prod
```

```bash
# @scripthaus command electron-rebuild
# @scripthaus cd :playbook
node_modules/.bin/electron-rebuild
```

```bash
# @scripthaus command electron
# @scripthaus cd :playbook
WAVETERM_DEV=1 PCLOUD_ENDPOINT="https://ot2e112zx5.execute-api.us-west-2.amazonaws.com/dev" PCLOUD_WS_ENDPOINT="wss://5lfzlg5crl.execute-api.us-west-2.amazonaws.com/dev/" node_modules/.bin/electron dist-dev/emain.js
```

```bash
# @scripthaus command electron-new
# @scripthaus cd :playbook
WAVETERM_DEV=1 PCLOUD_ENDPOINT="https://ot2e112zx5.execute-api.us-west-2.amazonaws.com/dev" PCLOUD_WS_ENDPOINT="wss://5lfzlg5crl.execute-api.us-west-2.amazonaws.com/dev/" node_modules/.bin/electron dist-dev-new/emain.js
```

```bash
# @scripthaus command typecheck
# @scripthaus cd :playbook
node_modules/.bin/tsc --noEmit
```

```bash
# @scripthaus command typecheck-new
# @scripthaus cd :playbook
node_modules/.bin/tsc -p tsconfig.new.json --noEmit
```

```bash
# @scripthaus command build-package
# @scripthaus cd :playbook
rm -rf dist/
rm -rf bin/
rm -rf build/
node_modules/.bin/webpack --env prod
WAVESRV_VERSION=$(node -e 'console.log(require("./version.js"))')
WAVESHELL_VERSION=v0.7
GO_LDFLAGS="-s -w -X main.BuildTime=$(date +'%Y%m%d%H%M')"
function buildWaveShell {
    (cd waveshell; CGO_ENABLED=0 GOOS=$1 GOARCH=$2 go build -ldflags="$GO_LDFLAGS" -o ../bin/mshell/mshell-$WAVESHELL_VERSION-$1.$2 main-waveshell.go)
}
function buildWaveSrv {
    (cd wavesrv; CGO_ENABLED=1 GOARCH=$1 go build -tags "osusergo,netgo,sqlite_omit_load_extension" -ldflags "-X main.BuildTime=$(date +'%Y%m%d%H%M') -X main.WaveVersion=$WAVESRV_VERSION" -o ../bin/wavesrv.$1 ./cmd)
}
buildWaveShell darwin amd64
buildWaveShell darwin arm64
buildWaveShell linux amd64
buildWaveShell linux arm64
buildWaveSrv arm64
buildWaveSrv amd64
yarn run electron-builder -c electron-builder.config.js -m -p never
```

```bash
# @scripthaus command build-package-linux
# @scripthaus cd :playbook
rm -rf dist/
rm -rf bin/
rm -rf build/
node_modules/.bin/webpack --env prod
WAVESRV_VERSION=$(node -e 'console.log(require("./version.js"))')
WAVESHELL_VERSION=v0.7
GO_LDFLAGS="-s -w -X main.BuildTime=$(date +'%Y%m%d%H%M')"
function buildWaveShell {
    (cd waveshell; CGO_ENABLED=0 GOOS=$1 GOARCH=$2 go build -ldflags="$GO_LDFLAGS" -o ../bin/mshell/mshell-$WAVESHELL_VERSION-$1.$2 main-waveshell.go)
}
function buildWaveSrv {
    # adds -extldflags=-static, *only* on linux (macos does not support fully static binaries) to avoid a glibc dependency
    (cd wavesrv; CGO_ENABLED=1 GOARCH=$1 go build -tags "osusergo,netcgo,sqlite_omit_load_extension" -ldflags "-linkmode 'external' -extldflags=-static $GO_LDFLAGS -X main.WaveVersion=$WAVESRV_VERSION" -o ../bin/wavesrv.$1 ./cmd)
}
buildWaveShell darwin amd64
buildWaveShell darwin arm64
buildWaveShell linux amd64
buildWaveShell linux arm64
buildWaveSrv $GOARCH
yarn run electron-builder -c electron-builder.config.js -l -p never
```

```bash
# @scripthaus command build-wavesrv
WAVESRV_VERSION=$(node -e 'console.log(require("./version.js"))')
cd wavesrv
CGO_ENABLED=1 go build -tags "osusergo,netcgo,sqlite_omit_load_extension" -ldflags "-X main.BuildTime=$(date +'%Y%m%d%H%M') -X main.WaveVersion=$WAVESRV_VERSION" -o ../bin/wavesrv ./cmd
```

```bash
# @scripthaus command fullbuild-waveshell
set -e
WAVESHELL_VERSION=v0.7
GO_LDFLAGS="-s -w -X main.BuildTime=$(date +'%Y%m%d%H%M')"
function buildWaveShell {
    (cd waveshell; CGO_ENABLED=0 GOOS=$1 GOARCH=$2 go build -ldflags="$GO_LDFLAGS" -o ../bin/mshell/mshell-$WAVESHELL_VERSION-$1.$2 main-waveshell.go)
}
buildWaveShell darwin amd64
buildWaveShell darwin arm64
buildWaveShell linux amd64
buildWaveShell linux arm64
```

```bash
# @scripthaus command build-backend
# @scripthaus cd :playbook
echo building waveshell
scripthaus run fullbuild-waveshell
echo building wavesrv
scripthaus run build-wavesrv
```
