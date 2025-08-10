const webpack = require("webpack");
const webpackMerge = require("webpack-merge");
const path = require("path");
const moment = require("dayjs");
const VERSION = require("../version.js");
const CopyPlugin = require("copy-webpack-plugin");

function makeBuildStr() {
    let buildStr = moment().format("YYYYMMDD-HHmmss");
    return buildStr;
}

const BUILD = makeBuildStr();

var electronCommonNew = {
    entry: {
        emain: ["./src_new/electron/emain.ts"],
    },
    target: "electron-main",
    externals: {
        fs: "require('fs')",
        "fs-ext": "require('fs-ext')",
    },
    devtool: "source-map",
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: [
                            [
                                "@babel/preset-env",
                                {
                                    targets:
                                        "defaults and not ie > 0 and not op_mini all and not op_mob > 0 and not kaios > 0 and not and_qq > 0 and not and_uc > 0 and not baidu > 0",
                                },
                            ],
                            "@babel/preset-react",
                            "@babel/preset-typescript",
                        ],
                        plugins: [
                            ["@babel/transform-runtime", { regenerator: true }],
                            "@babel/plugin-transform-react-jsx",
                            ["@babel/plugin-proposal-decorators", { legacy: true }],
                            ["@babel/plugin-proposal-class-properties", { loose: true }],
                            ["@babel/plugin-proposal-private-methods", { loose: true }],
                            ["@babel/plugin-proposal-private-property-in-object", { loose: true }],
                            "babel-plugin-jsx-control-statements",
                        ],
                    },
                },
            },
        ],
    },
    resolve: {
        extensions: [".ts", ".tsx", ".js"],
        alias: {
            "@": path.resolve(__dirname, "../src_new"),
            "@/*": path.resolve(__dirname, "../src_new/*"),
            "@/app": path.resolve(__dirname, "../src_new/app"),
            "@/app/*": path.resolve(__dirname, "../src_new/*"),
            "@/utils": path.resolve(__dirname, "../src_new/utils"),
            "@/utils/*": path.resolve(__dirname, "../src_new/utils/*"),
            "@/models": path.resolve(__dirname, "../src_new/models/index"),
            "@/models/*": path.resolve(__dirname, "../src_new/models/*"),
            "@/components": path.resolve(__dirname, "../src_new/components"),
            "@/components/*": path.resolve(__dirname, "../src_new/components/*"),
            "@/assets": path.resolve(__dirname, "../src_new/components/assets"),
            "@/assets/*": path.resolve(__dirname, "../src_new/components/assets/*"),
            "@/plugins": path.resolve(__dirname, "../src_new/plugins"),
            "@/plugins/*": path.resolve(__dirname, "../src_new/plugins/*"),
            "@/autocomplete": path.resolve(__dirname, "../src_new/autocomplete/index"),
            "@/autocomplete/*": path.resolve(__dirname, "../src_new/autocomplete/*"),
            "@/lib": path.resolve(__dirname, "../src_new/lib"),
            "@/lib/*": path.resolve(__dirname, "../src_new/lib/*"),
            "@/hooks": path.resolve(__dirname, "../src_new/hooks"),
            "@/hooks/*": path.resolve(__dirname, "../src_new/hooks/*"),
            "@/context": path.resolve(__dirname, "../src_new/context"),
            "@/context/*": path.resolve(__dirname, "../src_new/context/*"),
            "@/types": path.resolve(__dirname, "../src_new/types"),
            "@/types/*": path.resolve(__dirname, "../src_new/types/*"),
            "@/modals": path.resolve(__dirname, "../src_new/components/modals/index"),
            "@/modals/*": path.resolve(__dirname, "../src_new/components/modals/*"),
        },
    },
};

var electronDevNew = webpackMerge.merge(electronCommonNew, {
    mode: "development",
    output: {
        path: path.resolve(__dirname, "../dist-dev-new"),
        filename: "[name].js",
    },
    plugins: [
        new CopyPlugin({
            patterns: [{ from: "src_new/electron/preload.js", to: "preload.js" }],
        }),
        new webpack.DefinePlugin({
            __WAVETERM_DEV__: "true",
            __WAVETERM_VERSION__: JSON.stringify(VERSION),
            __WAVETERM_BUILD__: JSON.stringify("devbuild-new"),
        }),
    ],
});

var electronProdNew = webpackMerge.merge(electronCommonNew, {
    mode: "production",
    output: {
        path: path.resolve(__dirname, "../dist-new"),
        filename: "[name].js",
    },
    plugins: [
        new CopyPlugin({
            patterns: [{ from: "src_new/electron/preload.js", to: "preload.js" }],
        }),
        new webpack.DefinePlugin({
            __WAVETERM_DEV__: "false",
            __WAVETERM_VERSION__: JSON.stringify(VERSION),
            __WAVETERM_BUILD__: JSON.stringify(BUILD),
        }),
    ],
    optimization: {
        minimize: true,
    },
});

module.exports = { electronDevNew, electronProdNew };