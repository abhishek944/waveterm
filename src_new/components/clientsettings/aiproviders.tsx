// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobxReact from "mobx-react";
import * as mobx from "mobx";
import { boundMethod } from "autobind-decorator";
import { GlobalModel, GlobalCommandRunner } from "@/models/global";
import { Switch as Toggle } from "@/components/ui/toggle";
import { InlineSettingsTextEdit } from "@/components/ui/inlinesettingstextedit";
import { Button } from "@/components/ui/button";
import { commandRtnHandler, isBlank } from "@/utils/util";

@mobxReact.observer
class AiProviders extends React.Component<{}, {}> {
    @mobx.observable
    verifyingProvider: string = null;
    
    @mobx.observable
    isVerifying: boolean = false;
    
    constructor(props: {}) {
        super(props);
        mobx.makeObservable(this);
    }
    @boundMethod
    handleAiOptsChange(newAiOpts: any) {
        console.log("Setting AI opts:", newAiOpts);
        const prtn = GlobalCommandRunner.setAIOpts(newAiOpts);
        commandRtnHandler(prtn, null, () => {
            console.log("AI opts set successfully");
        });
    }
    @boundMethod
    handleProviderChange(provider: "gemini" | "openai" | "azure", key: string, value: string) {
        console.log(`[AiProviders.handleProviderChange] provider: ${provider}, key: ${key}, value: ${value}`);
        const cdata: ClientDataType = GlobalModel.clientData.get();
        const currentAiOpts = cdata.aiopts ?? {};
        
        // If this is the first time setting an API key and no provider is selected,
        // automatically select this provider
        let defaultProvider = (currentAiOpts as any).default;
        if (!defaultProvider || defaultProvider === "") {
            defaultProvider = provider;
        }
        
        const providerOpts = { ...(currentAiOpts[provider] ?? {}), [key]: value };
        const newAiOpts = { 
            ...currentAiOpts,
            default: defaultProvider,
            [provider]: providerOpts 
        };
        
        console.log("[AiProviders.handleProviderChange] newAiOpts:", newAiOpts);
        this.handleAiOptsChange(newAiOpts);
    }

    @boundMethod
    handleToggleProvider(provider: "gemini" | "openai" | "azure", enabled: boolean) {
        const cdata: ClientDataType = GlobalModel.clientData.get();
        const currentAiOpts = cdata.aiopts ?? {};
        
        // Create updated options with enabled status
        const providerOpts = { ...(currentAiOpts[provider] ?? {}), enabled };
        const newAiOpts = { 
            ...currentAiOpts,
            [provider]: providerOpts 
        };

        this.handleAiOptsChange(newAiOpts);
    }
    
    @boundMethod
    handleVerifyProvider(provider: "gemini" | "openai" | "azure") {
        console.log("[AiProviders.handleVerifyProvider] Starting verification for:", provider);
        console.log("[AiProviders.handleVerifyProvider] Current isVerifying:", this.isVerifying);
        console.log("[AiProviders.handleVerifyProvider] Current verifyingProvider:", this.verifyingProvider);
        
        // Set verifying state synchronously before any async operations
        mobx.runInAction(() => {
            this.isVerifying = true;
            this.verifyingProvider = provider;
            console.log("[AiProviders.handleVerifyProvider] Inside runInAction - isVerifying:", this.isVerifying);
        });
        
        console.log("[AiProviders.handleVerifyProvider] After runInAction - isVerifying:", this.isVerifying);
        
        // Use setTimeout to ensure the UI updates before running verification
        setTimeout(() => {
            console.log("[AiProviders.handleVerifyProvider] Running verification after timeout");
            this.runVerification(provider);
        }, 10);
    }
    
    @boundMethod
    async runVerification(provider: "gemini" | "openai" | "azure") {
        try {
            console.log("[AiProviders.runVerification] Sending verification command");
            const result = await GlobalCommandRunner.verifyAIProvider(provider);
            console.log("[AiProviders.runVerification] Response received:", result);
            
            if (!result.success) {
                console.error("[AiProviders.runVerification] Verification failed:", result.error);
            } else {
                console.log("[AiProviders.runVerification] Verification completed successfully");
            }
        } catch (error) {
            console.error("[AiProviders.runVerification] Exception caught:", error);
        } finally {
            // Always reset the verifying state
            mobx.action(() => {
                this.isVerifying = false;
                this.verifyingProvider = null;
            })();
            console.log("[AiProviders.runVerification] Reset isVerifying to false");
        }
    }

    render() {
        console.log("[AiProviders] render called, isVerifying:", this.isVerifying, "verifyingProvider:", this.verifyingProvider);
        const cdata: ClientDataType = GlobalModel.clientData.get();
        console.log("[AiProviders] render - clientData:", cdata);
        console.log("[AiProviders] render - aiopts:", cdata?.aiopts);
        
        const defaultProvider = cdata.aiopts?.default ?? "openai";
        const aiOpts = { default: defaultProvider, ...(cdata.aiopts ?? {}) };
        const geminiOpts = aiOpts.gemini ?? {};
        const openAIOpts = aiOpts.openai ?? {};
        const azureOpts = aiOpts.azure ?? {};
        const selectedProvider = defaultProvider;
        
        console.log("[AiProviders] render - defaultProvider:", defaultProvider);
        console.log("[AiProviders] render - geminiOpts:", geminiOpts);
        console.log("[AiProviders] render - openAIOpts:", openAIOpts);
        console.log("[AiProviders] render - openAIOpts.apitoken:", openAIOpts.apitoken);
        console.log("[AiProviders] render - azureOpts:", azureOpts);
        
        // Helper function to display masked API key
        const getMaskedValue = (value: string) => {
            if (!value) return "(not set)";
            return "••••••••" + value.slice(-4);
        };
        
        // Helper function to get connection status display
        const getConnectionStatus = (provider: "gemini" | "openai" | "azure") => {
            // Check verifying state first, before looking at provider options
            const isVerifying = this.isVerifying && this.verifyingProvider === provider;
            console.log(`[AiProviders.getConnectionStatus] provider: ${provider}, isVerifying: ${isVerifying}, this.isVerifying: ${this.isVerifying}, this.verifyingProvider: ${this.verifyingProvider}`);
            
            if (isVerifying) {
                return <span className="text-[13px] px-2 py-1 rounded text-blue-500 bg-blue-500/10">Verifying...</span>;
            }
            
            const providerOpts = aiOpts[provider];
            if (!providerOpts) return null;
            
            const status = providerOpts.connectionstatus;
            
            if (status === "connected") {
                return <span className="text-[13px] px-2 py-1 rounded text-green-500 bg-green-500/10">Connected</span>;
            } else if (status === "failed") {
                return <span className="text-[13px] px-2 py-1 rounded text-red-500 bg-red-500/10">Failed</span>;
            }
            
            return null;
        };
        
        // Helper function to check if we should show verify button
        const shouldShowVerify = (provider: "gemini" | "openai" | "azure") => {
            const providerOpts = aiOpts[provider];
            if (!providerOpts) return false;
            
            // Show verify button if API key is set (regardless of connection status)
            let hasApiKey = false;
            if (provider === "azure") {
                const azureOpts = providerOpts as AzureOpenAIOptsType;
                hasApiKey = !!(azureOpts.apitoken && azureOpts.baseurl && azureOpts.deploymentname);
            } else {
                hasApiKey = !!providerOpts.apitoken;
            }
                
            return hasApiKey;
        };

        return (
            <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border border-gray-700 rounded">
                    <h3 className="font-bold text-lg">OpenAI</h3>
                    <div className="mt-2 space-y-2">
                        <div className="flex items-center">
                            <div className="w-48">Model</div>
                            <InlineSettingsTextEdit
                                placeholder="Model (e.g., gpt-3.5-turbo)"
                                text={openAIOpts.model || "(not set)"}
                                value={openAIOpts.model || ""}
                                onChange={(val) => this.handleProviderChange("openai", "model", val)}
                                maxLength={256}
                                showIcon={true}
                            />
                        </div>
                        <div className="flex items-center">
                            <div className="w-48">API Key</div>
                            <InlineSettingsTextEdit
                                placeholder="API Key"
                                text={getMaskedValue(openAIOpts.apitoken)}
                                value={openAIOpts.apitoken || ""}
                                onChange={(val) => this.handleProviderChange("openai", "apitoken", val)}
                                maxLength={256}
                                showIcon={true}
                            />
                        </div>
                        <div className="flex items-center">
                            <div className="w-48"></div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => this.handleVerifyProvider("openai")}
                                    disabled={this.isVerifying}
                                >
                                    Verify
                                </Button>
                                {getConnectionStatus("openai")}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="p-4 border border-gray-700 rounded">
                    <h3 className="font-bold text-lg">Gemini</h3>
                    <div className="mt-2 space-y-2">
                        <div className="flex items-center">
                            <div className="w-48">Model</div>
                            <InlineSettingsTextEdit
                                placeholder="Model (e.g., gemini-pro)"
                                text={geminiOpts.model || "(not set)"}
                                value={geminiOpts.model || ""}
                                onChange={(val) => this.handleProviderChange("gemini", "model", val)}
                                maxLength={256}
                                showIcon={true}
                            />
                        </div>
                        <div className="flex items-center">
                            <div className="w-48">API Key</div>
                            <InlineSettingsTextEdit
                                placeholder="API Key"
                                text={getMaskedValue(geminiOpts.apitoken)}
                                value={geminiOpts.apitoken || ""}
                                onChange={(val) => this.handleProviderChange("gemini", "apitoken", val)}
                                maxLength={256}
                                showIcon={true}
                            />
                        </div>
                        <div className="flex items-center">
                            <div className="w-48"></div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => this.handleVerifyProvider("gemini")}
                                    disabled={this.isVerifying}
                                >
                                    Verify
                                </Button>
                                {getConnectionStatus("gemini")}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="p-4 border border-gray-700 rounded">
                    <h3 className="font-bold text-lg">Azure OpenAI</h3>
                    <div className="mt-2 space-y-2">
                        <div className="flex items-center">
                            <div className="w-48">Base URL</div>
                            <InlineSettingsTextEdit
                                placeholder="Base URL"
                                text={azureOpts.baseurl || "(not set)"}
                                value={azureOpts.baseurl || ""}
                                onChange={(val) => this.handleProviderChange("azure", "baseurl", val)}
                                maxLength={256}
                                showIcon={true}
                            />
                        </div>
                        <div className="flex items-center">
                            <div className="w-48">Deployment Name</div>
                            <InlineSettingsTextEdit
                                placeholder="Deployment Name"
                                text={azureOpts.deploymentname || "(not set)"}
                                value={azureOpts.deploymentname || ""}
                                onChange={(val) => this.handleProviderChange("azure", "deploymentname", val)}
                                maxLength={256}
                                showIcon={true}
                            />
                        </div>
                        <div className="flex items-center">
                            <div className="w-48">API Key</div>
                            <InlineSettingsTextEdit
                                placeholder="API Key"
                                text={getMaskedValue(azureOpts.apitoken)}
                                value={azureOpts.apitoken || ""}
                                onChange={(val) => this.handleProviderChange("azure", "apitoken", val)}
                                maxLength={256}
                                showIcon={true}
                            />
                        </div>
                        <div className="flex items-center">
                            <div className="w-48"></div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => this.handleVerifyProvider("azure")}
                                    disabled={this.isVerifying}
                                >
                                    Verify
                                </Button>
                                {getConnectionStatus("azure")}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="p-4 border border-gray-700 rounded">
                    <h3 className="font-bold text-lg">Default Provider</h3>
                    <div className="mt-2">
                        <select
                            value={defaultProvider}
                            onChange={(e) => {
                                const newDefault = e.target.value as "gemini" | "openai" | "azure";
                                const newAiOpts = { ...aiOpts, default: newDefault };
                                this.handleAiOptsChange(newAiOpts);
                            }}
                            className="px-2.5 py-1.5 border border-gray-700 rounded bg-black text-white text-sm outline-none focus:border-green-500"
                        >
                            <option value="openai">OpenAI</option>
                            <option value="gemini">Gemini</option>
                            <option value="azure">Azure OpenAI</option>
                        </select>
                    </div>
                </div>
                <div className="p-4 border border-gray-700 rounded">
                    <h3 className="font-bold text-lg">Thread Mode Execution</h3>
                    <div className="mt-2">
                        <div className="text-sm text-gray-400 mb-2">
                            Control how commands are executed in thread mode
                        </div>
                        <select
                            value={aiOpts.threadExecutionMode || "manual"}
                            onChange={(e) => {
                                const newMode = e.target.value as ThreadExecutionMode;
                                const newAiOpts = { ...aiOpts, threadExecutionMode: newMode };
                                this.handleAiOptsChange(newAiOpts);
                            }}
                            className="px-2.5 py-1.5 border border-gray-700 rounded bg-black text-white text-sm outline-none focus:border-green-500"
                        >
                            <option value="manual">Manual - Require user approval for each command</option>
                            <option value="semi-auto">Semi-Auto - (Coming Soon)</option>
                            <option value="full-auto">Full Auto - Execute commands automatically</option>
                        </select>
                    </div>
                </div>
            </div>
        );
    }
}

export { AiProviders };