// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobxReact from "mobx-react";
import { clsx } from "clsx";
import { GlobalModel } from "@/models";
import { PluginModel } from "@/plugins/plugins";
import { Markdown } from "@/components/ui/markdown";
import { MainView } from "@/components/ui/mainview";

const PluginsView: React.FC = mobxReact.observer(() => {
    const { pluginsModel } = GlobalModel;

    const closeView = React.useCallback(() => {
        pluginsModel.closeView();
    }, []);

    const renderPluginIcon = (plugin: any) => {
        let Comp = plugin.iconComp;
        return <Comp />;
    };

    if (GlobalModel.activeMainView.get() !== "plugins") {
        return null;
    }

    const selectedPlugin = pluginsModel.selectedPlugin.get();

    return (
        <MainView className="plugins-view" title="Apps" onClose={closeView}>
            <div className="body-ext">
                <div className="plugins-list">
                    {PluginModel.allPlugins().map((plugin, i) => (
                        <div
                            key={i}
                            className={clsx(
                                "plugin-summary",
                                "hover-light",
                                { "selected": plugin.name === selectedPlugin.name }
                            )}
                            onClick={() => pluginsModel.setSelectedPlugin(plugin)}
                        >
                            <div className="plugin-summary-header">
                                <div className="plugin-summary-icon">{renderPluginIcon(plugin)}</div>
                                <div className="plugin-summary-info">
                                    <div className="plugin-summary-title">{plugin.title}</div>
                                    <div className="plugin-summary-vendor">{plugin.vendor}</div>
                                </div>
                            </div>
                            <div className="plugin-summary-body">{plugin.summary}</div>
                        </div>
                    ))}
                </div>
                <div className="plugins-details">
                    <div className="plugin-summary-header">
                        <div className="plugin-summary-icon">{renderPluginIcon(selectedPlugin)}</div>
                        <div className="plugin-summary-info">
                            <div className="plugin-summary-title">{selectedPlugin.title}</div>
                            <div className="plugin-summary-vendor">{selectedPlugin.vendor}</div>
                        </div>
                    </div>
                    <div className="plugin-summary-body">{selectedPlugin.summary}</div>
                    {selectedPlugin.screenshots && selectedPlugin.screenshots.length > 0 && (
                        <div className="plugin-screenshots-container">
                            <div className="plugin-label">{"Screenshots"}</div>
                            <div className="plugin-screenshots">
                                {selectedPlugin.screenshots.map((path, index) => (
                                    <img key={index} src={path} alt={`Screenshot ${index}`} />
                                ))}
                            </div>
                        </div>
                    )}
                    {selectedPlugin.readme && (
                        <div className="plugin-readme">
                            <div className="plugin-label">{"Readme"}</div>
                            <Markdown text={selectedPlugin.readme} />
                        </div>
                    )}
                </div>
            </div>
        </MainView>
    );
});

export { PluginsView };