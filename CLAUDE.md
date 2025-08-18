# Check the backend build

scripthaus run fullbuild-waveshell && scripthaus run build-wavesrv

# Check the frontend build

scripthaus run webpack-build-new

# Debugging

If one fix failed, try debugging the issue by adding the debug logs.