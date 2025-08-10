const webpack = require("webpack");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const LodashModuleReplacementPlugin = require("lodash-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const webpackMerge = require("webpack-merge");
const path = require("path");
const moment = require("dayjs");
const VERSION = require("../version.js");

function makeBuildStr() {
    let buildStr = moment().format("YYYYMMDD-HHmmss");
    return buildStr;
}

const BUILD = makeBuildStr();

let BundleAnalyzerPlugin = null;
if (process.env.WEBPACK_ANALYZE) {
    BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
}

var webCommon = {
    entry: {
        waveterm: ["./src_new/main.tsx", "./src_new/globals.css"],
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                // exclude: /node_modules/,
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
            {
                test: /\.css$/,
                use: [
                    { loader: MiniCssExtractPlugin.loader }, 
                    "css-loader", 
                    {
                        loader: "postcss-loader",
                        options: {
                            postcssOptions: {
                                config: path.resolve(__dirname, "../postcss.config.new.js"),
                            },
                        },
                    }
                ],
            },
            {
                test: /\.less$/,
                use: [{ loader: MiniCssExtractPlugin.loader }, "css-loader", "less-loader"],
            },
            {
                test: /\.svg$/,
                use: [{ loader: "@svgr/webpack", options: { icon: true, svgo: false } }, "file-loader"],
            },
            {
                test: /\.md$/,
                type: "asset/source",
            },
            {
                test: /\.(png|jpe?g|gif)$/i,
                type: "asset/resource",
            },
        ],
    },
    resolve: {
        extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".wasm", ".json", ".less", ".css"],
        alias: {
            // Updated paths for src_new structure
            "@/app": path.resolve(__dirname, "../src_new/"),
            "@/utils": path.resolve(__dirname, "../src_new/utils/"),
            "@/models": path.resolve(__dirname, "../src_new/models/"),
            "@/components": path.resolve(__dirname, "../src_new/components/"),
            "@/assets": path.resolve(__dirname, "../src_new/components/assets/"),
            "@/plugins": path.resolve(__dirname, "../src_new/plugins/"),
            "@/autocomplete": path.resolve(__dirname, "../src_new/autocomplete/"),
            "@/lib": path.resolve(__dirname, "../src_new/lib/"),
            "@/hooks": path.resolve(__dirname, "../src_new/hooks/"),
            "@/context": path.resolve(__dirname, "../src_new/context/"),
            "@/types": path.resolve(__dirname, "../src_new/types/"),
            "@/appconst": path.resolve(__dirname, "../src_new/appconst"),
            
            "@/modals": path.resolve(__dirname, "../src_new/components/modals/"),
        },
    },
};

var webDevNew = webpackMerge.merge(webCommon, {
    mode: "development",
    output: {
        path: path.resolve(__dirname, "../dist-dev-new"),
        filename: "[name].js",
    },
    devtool: "source-map",
    devServer: {
        static: {
            directory: path.join(__dirname, "../public"),
        },
        port: 9001, // Different port to run alongside old version
        headers: {
            "Cache-Control": "no-store",
        },
    },
    plugins: [
        new MiniCssExtractPlugin({ filename: "[name].css", ignoreOrder: true }),
        new LodashModuleReplacementPlugin(),
        new webpack.DefinePlugin({
            __WAVETERM_DEV__: "true",
            __WAVETERM_VERSION__: JSON.stringify(VERSION),
            __WAVETERM_BUILD__: JSON.stringify("devbuild-new"),
        }),
    ],
    watchOptions: {
        aggregateTimeout: 200,
    },
});

var webProdNew = webpackMerge.merge(webCommon, {
    mode: "production",
    output: {
        path: path.resolve(__dirname, "../dist-new"),
        filename: "[name].js",
    },
    devtool: "source-map",
    plugins: [
        new MiniCssExtractPlugin({ filename: "[name].css", ignoreOrder: true }),
        new LodashModuleReplacementPlugin(),
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

if (BundleAnalyzerPlugin != null) {
    webProdNew.plugins.push(new BundleAnalyzerPlugin());
}

module.exports = { webDevNew: webDevNew, webProdNew: webProdNew };