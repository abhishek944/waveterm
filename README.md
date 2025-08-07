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
