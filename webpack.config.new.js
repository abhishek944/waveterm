const { webDevNew, webProdNew } = require("./webpack/webpack.web.new.js");
const { electronDevNew: electronDev, electronProdNew: electronProd } = require("./webpack/webpack.electron.new.js");

module.exports = (env) => {
    if (env.prod) {
        console.log("using PROD (web+electron) webpack environment for src_new");
        return [webProdNew, electronProd];
    }
    if (env["prod:web"]) {
        console.log("using PROD (web) webpack environment for src_new");
        return webProdNew;
    }
    if (env["prod:electron"]) {
        console.log("using PROD (electron) webpack environment");
        return electronProd;
    }
    if (env.dev) {
        console.log("using DEV (web+electron) webpack environment for src_new");
        return [webDevNew, electronDev];
    }
    if (env["dev:web"]) {
        console.log("using DEV (web) webpack environment for src_new");
        return webDevNew;
    }
    if (env["dev:electron"]) {
        console.log("using DEV (electron) webpack environment");
        return electronDev;
    }
    console.log("must specify a webpack environment using --env [dev|prod]");
};