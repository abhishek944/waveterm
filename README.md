## Running Locally

### One-Time Installations

1.  **Install Go, ScriptHaus, and Node.js**:

    ```sh
    brew install go
    brew tap scripthaus-dev/scripthaus
    brew install scripthaus
    npm install -g corepack
    ```

2.  **Install Project Dependencies**:
    ```sh
    corepack enable
    yarn install
    ```

### Running the Service

1.  **Build the Backend**:

    ```sh
    scripthaus run build-backend
    ```

2.  **Run Webpack Watch**:
    This will run in the background.

    ```sh
    scripthaus run webpack-watch
    ```

3.  **Run the Electron App**:
    ```sh
    scripthaus run electron
    ```

## Building from Source

-   [MacOS Build Instructions](./BUILD.md)
-   [Linux Build Instructions](./build-linux.md)

## Roadmap

[] User input: top / bottom
[] Add the go openai sdk, google sdk and connect the wave ai chat
[] Implement the threading and connect to the ai - Add the 'thread' button in linecomps - Clicking on it should add it to list of selected lines for thread. - In the input command line, on clicking cmd + I -> highlights all the lines in a thread and agentic calls can be made.
[] Remote server - wavify.

## Productionize

for distribution: export APPLE_TEAM_ID="your_team_id_here"

# Option 1: Using scripthaus (recommended)

scripthaus run build-package-new

# Option 2: Manual steps

# 1. Clean and build frontend (using new webpack config)

rm -rf dist/ dist-new/ bin/ build/
node_modules/.bin/webpack --config webpack.config.new.js --env prod

# 2. Build backends

scripthaus run build-backend

# 3. Create distributable

yarn install
yarn run electron-builder -c electron-builder.config.js -m -p never
