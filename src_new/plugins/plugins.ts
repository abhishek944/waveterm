// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SimpleImageRenderer } from "@/plugins/image";
import { SimpleMarkdownRenderer } from "@/plugins/markdown";
import { SourceCodeRenderer } from "@/plugins/code";
import { SimpleMustacheRenderer } from "@/plugins/mustache";
import { CSVRenderer } from "@/plugins/csv";
import { OpenAIRenderer, OpenAIRendererModel } from "@/plugins/openai";
import { SimplePdfRenderer } from "@/plugins/pdf";
import { SimpleMediaRenderer } from "@/plugins/media";
import { isBlank } from "@/utils/util";
import { sprintf } from "sprintf-js";

const PluginConfigs: RendererPluginType[] = [
    {
        name: "markdown",
        rendererType: "simple",
        heightType: "pixels",
        dataType: "blob",
        collapseType: "hide",
        globalCss: null,
        mimeTypes: ["text/markdown"],
        simpleComponent: SimpleMarkdownRenderer,
    },
    {
        name: "mustache",
        rendererType: "simple",
        heightType: "pixels",
        dataType: "blob",
        collapseType: "hide",
        globalCss: null,
        mimeTypes: ["text/plain"],
        simpleComponent: SimpleMustacheRenderer,
    },
    {
        name: "code",
        rendererType: "simple",
        heightType: "pixels",
        dataType: "blob",
        collapseType: "hide",
        globalCss: null,
        mimeTypes: ["text/plain"],
        simpleComponent: SourceCodeRenderer,
    },
    {
        name: "openai",
        rendererType: "full",
        heightType: "pixels",
        dataType: "model",
        collapseType: "remove",
        hidePrompt: true,
        globalCss: null,
        mimeTypes: ["application/json"],
        fullComponent: OpenAIRenderer,
        modelCtor: () => new OpenAIRendererModel(),
    },
    {
        name: "csv",
        rendererType: "simple",
        heightType: "pixels",
        dataType: "blob",
        collapseType: "hide",
        globalCss: null,
        mimeTypes: ["text/csv"],
        simpleComponent: CSVRenderer,
    },
    {
        name: "image",
        rendererType: "simple",
        heightType: "pixels",
        dataType: "blob",
        collapseType: "hide",
        globalCss: null,
        mimeTypes: ["image/*"],
        simpleComponent: SimpleImageRenderer,
    },
    {
        name: "pdf",
        rendererType: "simple",
        heightType: "pixels",
        dataType: "blob",
        collapseType: "hide",
        globalCss: null,
        mimeTypes: ["application/pdf"],
        simpleComponent: SimplePdfRenderer,
    },
    {
        name: "media",
        rendererType: "simple",
        heightType: "pixels",
        dataType: "blob",
        collapseType: "hide",
        globalCss: null,
        mimeTypes: ["video/*", "audio/*"],
        simpleComponent: SimpleMediaRenderer,
    },
];

class PluginModelClass {
    resourcesLoaded: boolean = false;
    rendererPlugins: RendererPluginType[] = [];

    constructor(pluginConfigs: RendererPluginType[]) {
        this.rendererPlugins = pluginConfigs.map((plugin: RendererPluginType): RendererPluginType => {
            if (isBlank(plugin.name)) {
                throw new Error("invalid plugin, no name");
            }
            if (plugin.name == "terminal" || plugin.name == "none") {
                throw new Error(sprintf("invalid plugin, name '%s' is reserved", plugin.name));
            }
            let existingPlugin = this.getRendererPluginByName(plugin.name);
            if (existingPlugin != null) {
                throw new Error(sprintf("plugin with name %s already registered", plugin.name));
            }
            this.rendererPlugins.push(plugin);
            return plugin;
        });
    }

    loadAllPluginResources() {
        if (this.resourcesLoaded) {
            return;
        }
        this.resourcesLoaded = true;
        for (let plugin of this.rendererPlugins) {
            this.loadPluginResources(plugin);
        }
    }

    attachScreenshots(plugin) {
        let screenshotsContext;
        let imagePaths = [];
        try {
            switch (plugin.name) {
                case "image":
                    screenshotsContext = require.context(`../../src/plugins/image/screenshots`, false, /\.(png|jpe?g|gif)$/);
                    break;
                case "markdown":
                    screenshotsContext = require.context(`../../src/plugins/markdown/screenshots`, false, /\.(png|jpe?g|gif)$/);
                    break;
                case "mustache":
                    screenshotsContext = require.context(`../../src/plugins/mustache/screenshots`, false, /\.(png|jpe?g|gif)$/);
                    break;
                case "code":
                    screenshotsContext = require.context(`../../src/plugins/code/screenshots`, false, /\.(png|jpe?g|gif)$/);
                    break;
                case "openai":
                    screenshotsContext = require.context(`../../src/plugins/openai/screenshots`, false, /\.(png|jpe?g|gif)$/);
                    break;
                case "csv":
                    screenshotsContext = require.context(`../../src/plugins/csv/screenshots`, false, /\.(png|jpe?g|gif)$/);
                    break;
                default:
                    return;
            }
            imagePaths = screenshotsContext.keys().map(screenshotsContext);
        } catch (error) {
            // no screenshots
        }
        plugin.screenshots = imagePaths.map((path) => path.default);
    }

    async loadPluginResources(plugin) {
        this.attachScreenshots(plugin);
        const handleImportError = (error, resourceType) =>
            console.error(`Failed to load ${resourceType} for plugin ${plugin.name}`);
        const iconPromise = import(`@/plugins/${plugin.name}/icon.svg`)
            .then((icon) => (plugin.iconComp = icon.ReactComponent))
            .catch((error) => handleImportError(error, "icon"));
        const readmePromise = import(`@/plugins/${plugin.name}/readme.md`)
            .then((content) => (plugin.readme = content.default))
            .catch((error) => handleImportError(error, "readme"));
        const metaPromise = import(`@/plugins/${plugin.name}/meta.json`)
            .then((json) => Object.assign(plugin, json))
            .catch((error) => handleImportError(error, "meta"));
        return Promise.allSettled([iconPromise, readmePromise, metaPromise]);
    }

    getRendererPluginByName(name: string): RendererPluginType {
        for (let i = 0; i < this.rendererPlugins.length; i++) {
            let plugin = this.rendererPlugins[i];
            if (plugin.name == name) {
                return plugin;
            }
        }
        return null;
    }

    allPlugins() {
        return this.rendererPlugins;
    }
}

let PluginModel: PluginModelClass = null;
if ((window as any).PluginModel == null) {
    PluginModel = new PluginModelClass(PluginConfigs);
    (window as any).PluginModel = PluginModel;
}

export { PluginModel };