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
    handleAiOptsChange(newAiOpts: any) {
        console.log("Setting AI opts:", newAiOpts);
        const prtn = GlobalCommandRunner.setAIOpts(newAiOpts);
        commandRtnHandler(prtn, (err) => {
            if (err) {
                console.error("error setting ai opts", err);
            } else {
                console.log("AI opts set successfully");
            }
        });
    }
    @boundMethod
    handleProviderChange(provider: "gemini" | "openai" | "azure", key: string, value: string) {
        const cdata: ClientDataType = GlobalModel.clientData.get();
        const aiOpts = { ...(cdata.aiopts ?? {}) };
        const providerOpts = { ...(aiOpts[provider] ?? {}), [key]: value };
        const newAiOpts = { ...aiOpts, [provider]: providerOpts };

        this.handleAiOptsChange(newAiOpts);
    }

    @boundMethod
    handleSelectProvider(provider: "gemini" | "openai" | "azure") {
        // Update default provider immediately for UI toggle
        const cdata: ClientDataType = GlobalModel.clientData.get();
        const aiopts = { ...(cdata.aiopts ?? {}), default: provider };
        mobx.action(() => {
            GlobalModel.clientData.set({ ...cdata, aiopts });
        })();
        this.handleAiOptsChange(aiopts);
    }

    render() {
        const cdata: ClientDataType = GlobalModel.clientData.get();
        const defaultProvider = cdata.aiopts?.default ?? "openai";
        const aiOpts = { default: defaultProvider, ...(cdata.aiopts ?? {}) };
        const geminiOpts = aiOpts.gemini ?? {};
        const openAIOpts = aiOpts.openai ?? {};
        const azureOpts = aiOpts.azure ?? {};
        const selectedProvider = defaultProvider;
        
        // Helper function to display masked API key
        const getMaskedValue = (value: string) => {
            if (!value) return "(not set)";
            return "••••••••" + value.slice(-4);
        };

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
                                text={getMaskedValue(geminiOpts.apitoken)}
                                value={geminiOpts.apitoken || ""}
                                onChange={(val) => this.handleProviderChange("gemini", "apitoken", val)}
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
                                text={getMaskedValue(openAIOpts.apitoken)}
                                value={openAIOpts.apitoken || ""}
                                onChange={(val) => this.handleProviderChange("openai", "apitoken", val)}
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
                                text={azureOpts.baseurl || "(not set)"}
                                value={azureOpts.baseurl || ""}
                                onChange={(val) => this.handleProviderChange("azure", "baseurl", val)}
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
                                text={azureOpts.deploymentname || "(not set)"}
                                value={azureOpts.deploymentname || ""}
                                onChange={(val) => this.handleProviderChange("azure", "deploymentname", val)}
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
                                text={getMaskedValue(azureOpts.apitoken)}
                                value={azureOpts.apitoken || ""}
                                onChange={(val) => this.handleProviderChange("azure", "apitoken", val)}
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
