// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobxReact from "mobx-react";
import * as mobx from "mobx";
import { boundMethod } from "autobind-decorator";
import { If } from "tsx-control-statements/components";
import { GlobalModel, GlobalCommandRunner } from "@/models";
import { Toggle, InlineSettingsTextEdit } from "@/common/elements";
import { commandRtnHandler, isBlank } from "@/util/util";

@mobxReact.observer
class AiProviders extends React.Component<{}, {}> {
    @boundMethod
    handleSelectProvider(provider: "gemini" | "openai" | "azure") {
        // Update default provider immediately for UI toggle
        const cdata: ClientDataType = GlobalModel.clientData.get();
        const aiopts = { ...(cdata.aiopts ?? {}), default: provider };
        mobx.action(() => {
            GlobalModel.clientData.set({ ...cdata, aiopts });
        })();
        const prtn = GlobalCommandRunner.setAIOpts(aiopts);
        commandRtnHandler(prtn, (err) => {
            console.log(err);
        });
    }

    render() {
        const cdata: ClientDataType = GlobalModel.clientData.get();
        const defaultProvider = cdata.aiopts?.default ?? "openai";
        const aiOpts = { default: defaultProvider, ...(cdata.aiopts ?? {}) };
        const geminiOpts = aiOpts.gemini ?? {};
        const openAIOpts = aiOpts.openai ?? {};
        const azureOpts = aiOpts.azure ?? {};
        const selectedProvider = defaultProvider;

        return (
            <div>
                <div className="settings-group">
                    <div className="settings-group-title">
                        <div>Gemini</div>
                        <Toggle
                            checked={selectedProvider === "gemini"}
                            onChange={() => this.handleSelectProvider("gemini")}
                        />
                    </div>
                    <div className="settings-field">
                        <div className="settings-label">API Key</div>
                        <div className="settings-input">
                            <InlineSettingsTextEdit
                                placeholder="API Key"
                                text={geminiOpts.apitoken ?? "API Key"}
                                value={geminiOpts.apitoken ?? ""}
                                onChange={(val) =>
                                    GlobalCommandRunner.setAIOpts({ ...aiOpts, gemini: { ...geminiOpts, apitoken: val } })
                                }
                                maxLength={256}
                                showIcon={true}
                            />
                        </div>
                    </div>
                </div>
                <div className="settings-group">
                    <div className="settings-group-title">
                        <div>OpenAI</div>
                        <Toggle
                            checked={selectedProvider === "openai"}
                            onChange={() => this.handleSelectProvider("openai")}
                        />
                    </div>
                    <div className="settings-field">
                        <div className="settings-label">API Key</div>
                        <div className="settings-input">
                            <InlineSettingsTextEdit
                                placeholder="API Key"
                                text={openAIOpts.apitoken ?? "API Key"}
                                value={openAIOpts.apitoken ?? ""}
                                onChange={(val) =>
                                    GlobalCommandRunner.setAIOpts({ ...aiOpts, openai: { ...openAIOpts, apitoken: val } })
                                }
                                maxLength={256}
                                showIcon={true}
                            />
                        </div>
                    </div>
                </div>
                <div className="settings-group">
                    <div className="settings-group-title">
                        <div>Azure OpenAI</div>
                        <Toggle
                            checked={selectedProvider === "azure"}
                            onChange={() => this.handleSelectProvider("azure")}
                        />
                    </div>
                    <div className="settings-field">
                        <div className="settings-label">Base URL</div>
                        <div className="settings-input">
                            <InlineSettingsTextEdit
                                placeholder="Base URL"
                                text={azureOpts.baseurl ?? "Base URL"}
                                value={azureOpts.baseurl ?? ""}
                                onChange={(val) =>
                                    GlobalCommandRunner.setAIOpts({ ...aiOpts, azure: { ...azureOpts, baseurl: val } })
                                }
                                maxLength={256}
                                showIcon={true}
                            />
                        </div>
                    </div>
                    <div className="settings-field">
                        <div className="settings-label">Deployment Name</div>
                        <div className="settings-input">
                            <InlineSettingsTextEdit
                                placeholder="Deployment Name"
                                text={azureOpts.deploymentname ?? "Deployment Name"}
                                value={azureOpts.deploymentname ?? ""}
                                onChange={(val) =>
                                    GlobalCommandRunner.setAIOpts({ ...aiOpts, azure: { ...azureOpts, deploymentname: val } })
                                }
                                maxLength={256}
                                showIcon={true}
                            />
                        </div>
                    </div>
                    <div className="settings-field">
                        <div className="settings-label">API Key</div>
                        <div className="settings-input">
                            <InlineSettingsTextEdit
                                placeholder="API Key"
                                text={azureOpts.apitoken ?? "API Key"}
                                value={azureOpts.apitoken ?? ""}
                                onChange={(val) =>
                                    GlobalCommandRunner.setAIOpts({ ...aiOpts, azure: { ...azureOpts, apitoken: val } })
                                }
                                maxLength={256}
                                showIcon={true}
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export { AiProviders };
