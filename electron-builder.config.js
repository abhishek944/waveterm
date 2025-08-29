const pkg = require("./package.json");
const fs = require("fs");
const path = require("path");

/**
 * @type {import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration/configuration
 */
const config = {
    appId: pkg.build.appId,
    productName: process.env.WAVETERM_DEV ? "Rock (Dev)" : pkg.productName,
    artifactName: "${productName}-${platform}-${arch}-${version}.${ext}",
    npmRebuild: false,
    nodeGypRebuild: false,
    electronCompile: false,
    files: [
        {
            from: "./dist-new",
            to: "./dist-new",
            filter: ["**/*"],
        },
        {
            from: "./public",
            to: "./public",
            filter: ["**/*"],
        },
        {
            from: "./bin",
            to: "./bin",
            filter: ["**/*"],
        },
        {
            from: ".",
            to: ".",
            filter: ["package.json"],
        },
        "!**/node_modules/**${/*}", // Ignore node_modules by default
        {
            from: "./node_modules",
            to: "./node_modules",
            filter: ["monaco-editor/min/**/*"], // This is the only module we want to include
        },
    ],
    directories: {
        output: "make",
    },
    asarUnpack: ["bin/**/*"],
    mac: {
        target: [
            {
                target: "zip",
                arch: "universal",
            },
            {
                target: "dmg",
                arch: "universal",
            },
        ],
        icon: "public/rockterminal.icns",
        category: "public.app-category.developer-tools",
        minimumSystemVersion: "10.15.0",
        notarize: process.env.APPLE_TEAM_ID
            ? {
                  teamId: process.env.APPLE_TEAM_ID,
              }
            : false,
        binaries: fs
            .readdirSync("bin", { recursive: true, withFileTypes: true })
            .filter((f) => f.isFile())
            .map((f) => path.resolve(f.path, f.name)),
        // macOS Permissions Configuration
        entitlements: "public/entitlements.mac.plist",
        entitlementsInherit: "public/entitlements.mac.plist",
        hardenedRuntime: true,
        gatekeeperAssess: false,
        // Custom Info.plist for permission usage descriptions
        extendInfo: {
            NSDownloadsFolderUsageDescription:
                "Rock Terminal needs access to your Downloads folder to read and write files for terminal operations.",
            NSDesktopFolderUsageDescription:
                "Rock Terminal needs access to your Desktop folder to read and write files for terminal operations.",
            NSDocumentsFolderUsageDescription:
                "Rock Terminal needs access to your Documents folder to read and write files for terminal operations.",
            NSFileProviderDomainUsageDescription:
                "Rock Terminal needs access to files to perform terminal operations like reading, writing, and executing files.",
        },
    },
    linux: {
        executableName: process.env.WAVETERM_DEV ? "Rock (Dev)" : pkg.productName,
        category: "TerminalEmulator",
        icon: "public/rockterminal.icns",
        target: ["zip", "deb", "rpm", "AppImage", "pacman"],
        synopsis: pkg.description,
        description: null,
        desktop: {
            Name: process.env.WAVETERM_DEV ? "Rock (Dev)" : pkg.productName,
            Comment: pkg.description,
            Keywords: "developer;terminal;emulator;",
            category: "Development;Utility;",
        },
    },
    appImage: {
        license: "LICENSE",
    },
    publish: {
        provider: "generic",
        url: "https://dl.waveterm.dev/releases", // TODOL change this.
    },
};

module.exports = config;
